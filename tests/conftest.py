"""Shared, genuine official source excerpts (no synthetic migration observations)."""

import shutil
from pathlib import Path

import pytest

from pipelines.build import build, transform
from pipelines.sources import raw_path, read_json, write_json

FIXTURES = Path(__file__).parent / "fixtures/official"


@pytest.fixture(scope="session")
def official_specs():
    return read_json(FIXTURES / "catalog.json")["sources"]


@pytest.fixture(scope="session")
def official_paths():
    provenance = read_json(FIXTURES / "provenance.json")
    return {key: FIXTURES / value["file"] for key, value in provenance.items()}


@pytest.fixture(scope="session")
def official_data(official_paths, official_specs):
    return transform(official_paths, official_specs)


@pytest.fixture
def snapshot_root(tmp_path, official_specs):
    provenance = read_json(FIXTURES / "provenance.json")
    lock = {"lock_version": 1, "sources": {}}
    write_json(tmp_path / "data/sources.json", {"sources": official_specs})
    for key, value in provenance.items():
        snapshot = dict(
            value["original_snapshot"],
            sha256=value["sha256"],
            filename=value["file"],
            bytes=(FIXTURES / value["file"]).stat().st_size,
        )
        lock["sources"][key] = snapshot
        path = raw_path(tmp_path, snapshot)
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(FIXTURES / value["file"], path)
    write_json(tmp_path / "data/sources.lock.json", lock)
    return tmp_path


@pytest.fixture
def official_bundle(snapshot_root):
    return build(snapshot_root)
