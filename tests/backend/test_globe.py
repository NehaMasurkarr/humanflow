"""Globe contracts queried against real PostgreSQL with official source excerpts."""

import json
import os
from importlib.resources import files

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.rows import dict_row

from backend.main import create_app
from backend.services.globe import GlobeRepository, get_repository
from backend.sync_anchors import sync_anchors
from pipelines.database import load_bundle, migrate


@pytest.fixture
def globe_client(official_bundle):
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL for PostgreSQL-backed API tests")
    with psycopg.connect(url) as connection, connection.transaction(force_rollback=True):
        migrate(connection)
        load_bundle(connection, official_bundle)
        sync_anchors(connection)
        connection.row_factory = dict_row
        app = create_app()
        app.dependency_overrides[get_repository] = lambda: GlobeRepository(connection)
        with TestClient(app) as client:
            yield client


def stock_params(**overrides):
    return dict(
        mode="global", dataset_id="un_stock_2024", year=2024, measure="stock_persons", **overrides
    )


def test_database_not_configured_is_explicit_and_health_survives(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with TestClient(create_app()) as client:
        assert client.get("/health").status_code == 200
        response = client.get("/v1/datasets")
        assert response.status_code == 503
        assert "not configured" in response.json()["detail"]


@pytest.mark.postgres
def test_catalog_preserves_modes_periods_and_provenance(globe_client):
    rows = globe_client.get("/v1/datasets").json()
    assert len(rows) == 4
    stock = next(r for r in rows if r["id"] == "un_stock_2024")
    assert stock["observation_type"] == "stock"
    assert {p["year_end"] for p in stock["periods"]} == {
        1990,
        1995,
        2000,
        2005,
        2010,
        2015,
        2020,
        2024,
    }
    assert "not annual migration flows" in stock["caveat"]
    assert len(stock["source_sha256"]) == 64
    us = globe_client.get("/v1/datasets", params={"mode": "us"}).json()
    assert len(us) == 3 and all(r["mode"] == "us" for r in us)
    irs = next(r for r in us if r["id"] == "irs_state_2223")
    assert irs["periods"][0]["year_start"] == 2022
    assert "filing years" in irs["periods"][0]["label"]


@pytest.mark.postgres
def test_geography_search_and_actual_coordinates(globe_client):
    response = globe_client.get("/v1/geographies", params={"mode": "us", "search": "Alabama"})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    row = data["items"][0]
    assert row["id"] == "state:01"
    anchors = json.loads(files("backend").joinpath("assets/geographic-anchors.json").read_text())
    anchor = next(r for r in anchors if r["id"] == "state:01")
    assert row["anchor"]["latitude"] == anchor["latitude"]
    assert row["anchor"]["longitude"] == anchor["longitude"]
    assert "census.gov" in row["anchor"]["source_url"]
    assert (
        globe_client.get("/v1/geographies", params={"search": "%' OR 1=1--"}).json()["total"] == 0
    )
    assert globe_client.get("/v1/geographies", params={"search": "%"}).json()["total"] == 0


@pytest.mark.postgres
def test_stock_direction_source_and_pagination(globe_client, official_data):
    response = globe_client.get(
        "/v1/corridors",
        params=stock_params(origin_id="country:356", destination_id="country:840", limit=1),
    )
    assert response.status_code == 200, response.text
    page = response.json()
    assert page["total"] == 1
    row = page["items"][0]
    assert row["origin"]["id"] == "country:356"
    assert row["destination"]["id"] == "country:840"
    expected = official_data[0]["migration"].query(
        "dataset_id == 'un_stock_2024' and origin_id == 'country:356' "
        "and destination_id == 'country:840' and year_end == 2024"
    )
    assert row["value"] == expected.iloc[0].value
    assert row["unit"] == "persons"
    assert "not travel paths" in page["anchor_disclaimer"]
    assert page["dataset"]["source_url"].startswith("https://www.un.org/")
    assert (
        globe_client.get("/v1/corridors", params=stock_params(offset=10000)).json()["items"] == []
    )


@pytest.mark.postgres
@pytest.mark.parametrize(
    "overrides",
    [
        {"year": 2023},
        {"mode": "us"},
        {"measure": "acs_movers"},
        {"origin_id": "state:01"},
        {"destination_id": "country:999"},
        {"limit": 151},
        {"offset": -1},
        {"min_value": -1},
    ],
)
def test_invalid_filters_rejected(globe_client, overrides):
    params = stock_params()
    params.update(overrides)
    assert globe_client.get("/v1/corridors", params=params).status_code == 422


@pytest.mark.postgres
def test_acs_missing_values_never_become_routes_and_empty_state(globe_client):
    params = dict(
        mode="us", dataset_id="census_acs_2024", year=2024, measure="acs_movers", limit=150
    )
    data = globe_client.get("/v1/corridors", params=params).json()
    assert data["unavailable_in_period"] == 255
    assert len(data["items"]) == 150
    assert all(row["value"] is not None and row["moe"] is not None for row in data["items"])
    empty = globe_client.get("/v1/corridors", params=dict(params, min_value=10**12)).json()
    assert empty["items"] == [] and empty["total"] == 0


@pytest.mark.postgres
def test_irs_measure_and_reporting_period(globe_client):
    params = dict(mode="us", dataset_id="irs_state_2223", year=2023, measure="tax_returns")
    response = globe_client.get("/v1/corridors", params=params)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["items"] and data["measure"]["unit"] == "returns"
    assert data["period"]["year_start"] == 2022
    assert data["dataset"]["period_type"] == "filing_year_transition"
