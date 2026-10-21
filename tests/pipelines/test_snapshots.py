import pytest

from pipelines.build import build, read_bundle
from pipelines.sources import SourceError, digest, fetch, raw_path, read_json, write_json


def test_build_and_cached_fetch_are_idempotent(snapshot_root, monkeypatch):
    def no_network(url):
        pytest.fail(f"Unexpected download {url}")

    monkeypatch.setattr("pipelines.sources.retrieve", no_network)
    fetch(snapshot_root)
    first = build(snapshot_root)
    manifest = read_json(first / "manifest.json")
    assert build(snapshot_root) == first
    assert read_json(first / "manifest.json") == manifest
    read_bundle(first)
    archived = snapshot_root / "previous-build"
    first.rename(archived)
    rebuilt = build(snapshot_root)
    assert read_json(rebuilt / "manifest.json") == manifest
    assert (archived / "migration.csv").read_bytes() == (rebuilt / "migration.csv").read_bytes()


def test_corrupt_cached_source_is_rejected(snapshot_root):
    lock = read_json(snapshot_root / "data/sources.lock.json")
    path = raw_path(snapshot_root, next(iter(lock["sources"].values())))
    path.write_bytes(b"corrupt")
    with pytest.raises(SourceError, match="cached checksum mismatch"):
        fetch(snapshot_root)


def test_changed_official_download_requires_explicit_refresh(snapshot_root, monkeypatch):
    lock_path = snapshot_root / "data/sources.lock.json"
    lock = read_json(lock_path)
    first = next(iter(lock["sources"].values()))
    raw_path(snapshot_root, first).unlink()
    monkeypatch.setattr("pipelines.sources.retrieve", lambda url: (b"changed bytes", url))
    with pytest.raises(SourceError, match="official bytes changed"):
        fetch(snapshot_root)
    assert read_json(lock_path) == lock


def test_source_failure_does_not_publish_partial_lock(snapshot_root, monkeypatch):
    before = (snapshot_root / "data/sources.lock.json").read_bytes()

    def unavailable(url):
        raise SourceError("Official source unavailable")

    monkeypatch.setattr("pipelines.sources.retrieve", unavailable)
    with pytest.raises(SourceError, match="Official source unavailable"):
        fetch(snapshot_root, refresh=True)
    assert (snapshot_root / "data/sources.lock.json").read_bytes() == before


def test_processed_corruption_rejected(official_bundle):
    path = official_bundle / "migration.csv"
    path.write_bytes(path.read_bytes() + b"corrupt")
    with pytest.raises(ValueError, match="Bundle checksum mismatch"):
        read_bundle(official_bundle)


def test_rehashed_invalid_record_still_rejected(official_bundle):
    path = official_bundle / "migration.csv"
    path.write_text(path.read_text().replace("stock_persons,persons", "stock_persons,invalid", 1))
    manifest = read_json(official_bundle / "manifest.json")
    manifest["files"][path.name] = digest(path.read_bytes())
    write_json(official_bundle / "manifest.json", manifest)
    with pytest.raises(ValueError, match="Inconsistent migration units"):
        read_bundle(official_bundle)
