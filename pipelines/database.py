"""Transactional PostgreSQL migrations and idempotent snapshot loads."""

from importlib.resources import files

import pandas as pd
import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

from pipelines.build import read_bundle
from pipelines.sources import digest


def migrate(connection: psycopg.Connection) -> None:
    with connection.transaction():
        connection.execute("SELECT pg_advisory_xact_lock(71854021)")
        connection.execute("CREATE SCHEMA IF NOT EXISTS humanflow")
        connection.execute("SET LOCAL search_path TO humanflow, public")
        connection.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations "
            "(version text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz DEFAULT now())"
        )
        for resource in sorted(files("pipelines").joinpath("sql").iterdir(), key=lambda p: p.name):
            if not resource.name.endswith(".sql"):
                continue
            body = resource.read_bytes()
            sha = digest(body)
            prior = connection.execute(
                "SELECT sha256 FROM schema_migrations WHERE version = %s", (resource.name,)
            ).fetchone()
            if prior:
                if prior[0] != sha:
                    raise ValueError(
                        f"Applied migration changed: {resource.name}; add a new migration"
                    )
                continue
            connection.execute(body.decode())
            connection.execute(
                "INSERT INTO schema_migrations (version, sha256) VALUES (%s, %s)",
                (resource.name, sha),
            )


def copy_frame(connection, table: str, frame: pd.DataFrame) -> None:
    statement = sql.SQL("COPY {} ({}) FROM STDIN").format(
        sql.Identifier("humanflow", table), sql.SQL(", ").join(map(sql.Identifier, frame.columns))
    )
    with connection.cursor().copy(statement) as writer:
        for row in frame.itertuples(index=False, name=None):
            writer.write_row(tuple(None if pd.isna(v) else v for v in row))


def load_bundle(connection: psycopg.Connection, bundle) -> dict:
    manifest, frames = read_bundle(bundle)
    batch_id = manifest["batch_id"]
    with connection.transaction():
        connection.execute("SELECT pg_advisory_xact_lock(71854021)")
        connection.execute("SET LOCAL search_path TO humanflow, public")
        existing = connection.execute(
            "SELECT 1 FROM ingestion_runs WHERE batch_id = %s", (batch_id,)
        ).fetchone()
        if not existing:
            connection.execute(
                "INSERT INTO ingestion_runs (batch_id, transform_version, manifest) "
                "VALUES (%s,%s,%s)",
                (batch_id, manifest["identity"]["version"], Jsonb(manifest)),
            )
            for spec in manifest["catalog"]:
                connection.execute(
                    "INSERT INTO datasets VALUES (%s,%s) ON CONFLICT (id) "
                    "DO UPDATE SET metadata=EXCLUDED.metadata",
                    (spec["id"], Jsonb(spec)),
                )
                connection.execute(
                    "INSERT INTO dataset_releases VALUES (%s,%s,%s)",
                    (batch_id, spec["id"], Jsonb(spec)),
                )
            for key, source in manifest["sources"].items():
                connection.execute(
                    "INSERT INTO source_snapshots VALUES (%s,%s,%s,%s,%s,%s,%s)",
                    (
                        batch_id,
                        key,
                        source["sha256"],
                        source["url"],
                        source["final_url"],
                        source["retrieved_at"],
                        source["bytes"],
                    ),
                )
            for row in frames["geographies"].itertuples(index=False, name=None):
                values = tuple(None if pd.isna(v) else v for v in row)
                connection.execute(
                    "INSERT INTO geographies VALUES (%s,%s,%s,%s,%s,%s,%s) "
                    "ON CONFLICT (id) DO NOTHING",
                    values,
                )
            for row in frames["corridors"].itertuples(index=False, name=None):
                connection.execute(
                    "INSERT INTO corridors VALUES (%s,%s) ON CONFLICT DO NOTHING", row
                )
            for spec in manifest["catalog"]:
                if spec["kind"] == "wb_indicator":
                    metadata = manifest["reports"][spec["id"]]["indicator_metadata"]
                    connection.execute(
                        "INSERT INTO economic_indicators VALUES (%s,%s,%s,%s) "
                        "ON CONFLICT (code) DO NOTHING",
                        (spec["indicator"], spec["indicator_name"], spec["unit"], Jsonb(metadata)),
                    )
            for source, table in [
                ("migration", "migration_observations"),
                ("economic", "economic_observations"),
            ]:
                frame = frames[source].copy()
                frame.insert(0, "batch_id", batch_id)
                copy_frame(connection, table, frame)
        connection.execute(
            "INSERT INTO active_batch VALUES (true,%s) ON CONFLICT (singleton) "
            "DO UPDATE SET batch_id=EXCLUDED.batch_id",
            (batch_id,),
        )
    return {"batch_id": batch_id, "already_loaded": bool(existing), "counts": manifest["counts"]}
