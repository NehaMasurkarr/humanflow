"""Official source catalog and checksum-verified, immutable raw snapshots."""

import hashlib
import json
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class SourceError(ValueError):
    """A source cannot be retrieved or does not match the reviewed snapshot."""


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text())


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n")
    temporary.replace(path)


def catalog(root: Path) -> list[dict]:
    return read_json(root / "data/sources.json")["sources"]


def raw_path(root: Path, snapshot: dict) -> Path:
    return root / "data/raw" / snapshot["sha256"] / snapshot["filename"]


def retrieve(url: str) -> tuple[bytes, str]:
    """Retry transient official-server failures; never switch sources."""
    for attempt in range(3):
        try:
            request = Request(url, headers={"User-Agent": "HumanFlow/0.2 (public data ingestion)"})
            with urlopen(request, timeout=90) as response:
                return response.read(), response.geturl()
        except (HTTPError, URLError, TimeoutError) as exc:
            if (
                attempt == 2
                or isinstance(exc, HTTPError)
                and exc.code not in {429, 500, 502, 503, 504}
            ):
                raise SourceError(f"Cannot download {url}: {exc}") from exc
            time.sleep(2**attempt)
    raise AssertionError("unreachable")


def fetch(root: Path, *, refresh: bool = False) -> dict:
    """Pinned by default. Explicit refresh creates a new reviewable source lock."""
    lock_path = root / "data/sources.lock.json"
    previous = read_json(lock_path) if lock_path.exists() else {"sources": {}}
    snapshots = {}
    for source in catalog(root):
        key = source["id"]
        pinned = previous["sources"].get(key)
        if pinned and pinned["url"] != source["url"] and not refresh:
            raise SourceError(f"{key}: URL changed; review catalog and use fetch --refresh")
        if not pinned and not refresh:
            raise SourceError(
                f"{key}: no pinned snapshot; initial acquisition needs fetch --refresh"
            )
        if pinned and not refresh and raw_path(root, pinned).exists():
            if digest(raw_path(root, pinned).read_bytes()) != pinned["sha256"]:
                raise SourceError(f"{key}: cached checksum mismatch; remove corrupt file and retry")
            snapshots[key] = pinned
            continue
        body, final_url = retrieve(source["url"])
        sha = digest(body)
        if pinned and not refresh and sha != pinned["sha256"]:
            raise SourceError(f"{key}: official bytes changed; review before fetch --refresh")
        filename = source["url"].split("?")[0].rsplit("/", 1)[-1]
        if "." not in filename:
            filename = key + ".json"
        record = {
            "url": source["url"],
            "final_url": final_url,
            "sha256": sha,
            "bytes": len(body),
            "filename": filename,
            "retrieved_at": datetime.now(UTC).isoformat(),
        }
        if pinned and not refresh:
            record = pinned
        path = raw_path(root, record)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".part")
        temporary.write_bytes(body)
        temporary.replace(path)
        snapshots[key] = record
        print(f"Fetched {key}: {len(body):,} bytes", flush=True)
    lock = {"lock_version": 1, "sources": snapshots}
    # Commit the lock only after every source succeeds. No partial catalog is published.
    if refresh:
        write_json(lock_path, lock)
    return lock


def verified_paths(root: Path) -> tuple[dict, dict[str, Path]]:
    lock = read_json(root / "data/sources.lock.json")
    paths = {}
    for source in catalog(root):
        record = lock["sources"][source["id"]]
        path = raw_path(root, record)
        if record["url"] != source["url"] or digest(path.read_bytes()) != record["sha256"]:
            raise SourceError(f"{source['id']}: snapshot verification failed")
        paths[source["id"]] = path
    return lock, paths
