"""Real PostgreSQL tests; the configured database is isolated and changes roll back."""

import os

import psycopg
import pytest

from analytics.queries import query
from pipelines.build import read_bundle
from pipelines.database import load_bundle, migrate
from pipelines.validation import ValidationError

pytestmark = pytest.mark.postgres


@pytest.fixture
def connection():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to run PostgreSQL integration tests")
    with psycopg.connect(url) as connection, connection.transaction(force_rollback=True):
        migrate(connection)
        yield connection


def test_migration_and_load_are_idempotent(connection, official_bundle):
    migrate(connection)
    first = load_bundle(connection, official_bundle)
    second = load_bundle(connection, official_bundle)
    assert not first["already_loaded"]
    assert second["already_loaded"]
    for name, table in [
        ("migration", "migration_observations"),
        ("economic", "economic_observations"),
    ]:
        assert (
            connection.execute(f"SELECT count(*) FROM humanflow.{table}").fetchone()[0]
            == (first["counts"][name])
        )
    assert connection.execute("SELECT count(*) FROM humanflow.schema_migrations").fetchone()[0] == 1


def test_failed_load_rolls_back_all_changes(connection, official_bundle, monkeypatch):
    from pipelines.database import copy_frame

    def fail_economic(conn, table, frame):
        if table == "economic_observations":
            raise ValueError("Injected load failure after migration copy")
        copy_frame(conn, table, frame)

    monkeypatch.setattr("pipelines.database.copy_frame", fail_economic)
    with pytest.raises(ValueError, match="Injected load failure"):
        load_bundle(connection, official_bundle)
    assert connection.execute("SELECT count(*) FROM humanflow.ingestion_runs").fetchone()[0] == 0
    assert (
        connection.execute("SELECT count(*) FROM humanflow.migration_observations").fetchone()[0]
        == 0
    )
    assert connection.execute("SELECT count(*) FROM humanflow.active_batch").fetchone()[0] == 0


def test_database_enforces_units_and_missing_status(connection, official_bundle):
    load_bundle(connection, official_bundle)
    with pytest.raises(psycopg.errors.ForeignKeyViolation), connection.transaction():
        connection.execute("UPDATE humanflow.migration_observations SET unit='invalid'")
    with pytest.raises(psycopg.errors.CheckViolation), connection.transaction():
        connection.execute(
            "UPDATE humanflow.migration_observations SET value=NULL WHERE status='observed'"
        )


def test_all_analytics_queries_on_real_excerpts(connection, official_bundle):
    load_bundle(connection, official_bundle)
    params = dict(
        dataset_id="un_stock_2024", year_start=2024, year_end=2024, measure="stock_persons"
    )
    top = query(connection, "top_corridors", dict(params, limit=5))
    assert top and all(r["observation_type"] == "stock" for r in top)
    assert query(connection, "geography_comparison", params)
    trend = query(
        connection,
        "migration_trends",
        dict(
            family="un_stock_2024",
            measure="stock_persons",
            origin_id="country:356",
            destination_id="country:840",
        ),
    )
    assert len(trend) == 8
    assert all(r["change_definition"] == "change_in_stock" for r in trend)
    net = query(
        connection,
        "net_migration",
        dict(dataset_id="census_acs_2023", year_start=2023, year_end=2023),
    )
    assert len(net) == 51
    assert sum(r["net_interstate_estimate"] for r in net) == 0
    economic = query(connection, "economic_comparison", dict(year=2023, indicator="SP.POP.TOTL"))
    assert len(economic) == 2
    manifest, _ = read_bundle(official_bundle)
    assert connection.execute("SELECT count(*) FROM humanflow.source_snapshots").fetchone()[
        0
    ] == len(manifest["sources"])


@pytest.mark.parametrize(
    ("name", "params", "message"),
    [
        (
            "net_migration",
            dict(dataset_id="un_stock_2024", year_start=2024, year_end=2024),
            "Net migration supported only",
        ),
        (
            "net_migration",
            dict(dataset_id="irs_state_2223", year_start=2022, year_end=2023),
            "Net migration supported only",
        ),
        (
            "top_corridors",
            dict(
                dataset_id="un_stock_2024",
                year_start=2023,
                year_end=2023,
                measure="stock_persons",
                limit=5,
            ),
            "Unsupported comparison year",
        ),
        (
            "top_corridors",
            dict(
                dataset_id="un_stock_2024",
                year_start=2020,
                year_end=2024,
                measure="stock_persons",
                limit=5,
            ),
            "Unsupported period comparison",
        ),
        (
            "top_corridors",
            dict(
                dataset_id="un_stock_2024",
                year_start=2024,
                year_end=2024,
                measure="acs_movers",
                limit=5,
            ),
            "Unsupported measure for dataset",
        ),
    ],
)
def test_unsupported_comparisons_rejected(connection, official_bundle, name, params, message):
    load_bundle(connection, official_bundle)
    with pytest.raises(ValidationError, match=message):
        query(connection, name, params)


def test_economic_and_trend_query_guards(connection, official_bundle):
    load_bundle(connection, official_bundle)
    with pytest.raises(ValidationError, match="Unsupported economic indicator/year"):
        query(connection, "economic_comparison", dict(year=2014, indicator="SP.POP.TOTL"))
    with pytest.raises(ValidationError, match="Unsupported trend family/measure"):
        query(
            connection,
            "migration_trends",
            dict(
                family="un_stock_2024",
                measure="acs_movers",
                origin_id="country:356",
                destination_id="country:840",
            ),
        )
