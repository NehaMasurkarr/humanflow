"""Apply schema migrations and load reviewed geographic anchors: python -m backend.sync_anchors."""

import json
import os
from importlib.resources import files

import psycopg

from backend.models import Anchor
from pipelines.database import migrate


def sync_anchors(connection) -> int:
    asset = json.loads(files("backend").joinpath("assets/geographic-anchors.json").read_text())
    anchors = asset["anchors"] if isinstance(asset, dict) else asset
    count = 0
    with connection.transaction():
        connection.execute("SELECT pg_advisory_xact_lock(71854021)")
        for record in anchors:
            anchor = Anchor.model_validate(record)
            geography_id = record.get("id", record.get("geography_id"))
            if not connection.execute(
                "SELECT 1 FROM humanflow.geographies WHERE id=%s", (geography_id,)
            ).fetchone():
                continue
            connection.execute(
                "INSERT INTO humanflow.visualization_anchors VALUES (%s,%s,%s,%s,%s,%s) "
                "ON CONFLICT (geography_id) DO UPDATE SET latitude=EXCLUDED.latitude, "
                "longitude=EXCLUDED.longitude, method=EXCLUDED.method, "
                "source_url=EXCLUDED.source_url, source_sha256=EXCLUDED.source_sha256",
                (
                    geography_id,
                    anchor.latitude,
                    anchor.longitude,
                    anchor.method,
                    anchor.source_url,
                    anchor.source_sha256,
                ),
            )
            count += 1
    return count


def main():
    with psycopg.connect(os.environ["DATABASE_URL"]) as connection:
        migrate(connection)
        print(f"Loaded {sync_anchors(connection)} representative visualization anchors")


if __name__ == "__main__":
    main()
