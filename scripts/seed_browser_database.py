"""Seed an isolated *_browser database with genuine official excerpts for browser CI."""

import os
import shutil
import tempfile
from pathlib import Path

import psycopg

from backend.sync_anchors import sync_anchors
from pipelines.build import build
from pipelines.database import load_bundle, migrate
from pipelines.sources import raw_path, read_json, write_json


def main():
    fixtures = Path(__file__).parents[1] / "tests/fixtures/official"
    provenance = read_json(fixtures / "provenance.json")
    with psycopg.connect(os.environ["DATABASE_URL"]) as connection:
        if not connection.info.dbname.endswith("_browser"):
            raise ValueError("Browser seeding requires a dedicated database ending in _browser")
        with tempfile.TemporaryDirectory(prefix="humanflow-browser-") as directory:
            root = Path(directory)
            write_json(root / "data/sources.json", read_json(fixtures / "catalog.json"))
            snapshots = {}
            for key, item in provenance.items():
                source = fixtures / item["file"]
                snapshot = dict(
                    item["original_snapshot"],
                    sha256=item["sha256"],
                    filename=item["file"],
                    bytes=source.stat().st_size,
                )
                snapshots[key] = snapshot
                target = raw_path(root, snapshot)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target)
            write_json(root / "data/sources.lock.json", {"lock_version": 1, "sources": snapshots})
            bundle = build(root)
            migrate(connection)
            result = load_bundle(connection, bundle)
            anchors = sync_anchors(connection)
            print(f"Seeded official excerpts: {result['counts']}; {anchors} geographic anchors")


if __name__ == "__main__":
    main()
