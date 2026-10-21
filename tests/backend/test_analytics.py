"""Analytics calculations checked against independently grouped official source data."""

import csv
import io

import pytest

from backend.api.analytics import safe_cell

pytestmark = pytest.mark.postgres


def params(**overrides):
    result = dict(mode="global", dataset_id="un_stock_2024", year=2024, measure="stock_persons")
    result.update(overrides)
    return result


def report(client, kind, **overrides):
    response = client.get(f"/v1/analytics/{kind}", params=params(**overrides))
    assert response.status_code == 200, response.text
    return response.json()


def test_rankings_and_corridors_match_source_rows(globe_client, official_data):
    frame = official_data[0]["migration"]
    selected = frame.query("dataset_id == 'un_stock_2024' and year_end == 2024")
    data = report(globe_client, "rankings", limit=250)
    expected = selected.groupby("destination_id").value.sum(min_count=1)
    assert data["total"] == len(expected)
    for row in data["items"]:
        assert row["value"] == expected[row["geography_id"]]
    corridors = report(globe_client, "corridors", limit=2)
    assert [r["value"] for r in corridors["items"]] == sorted(
        selected.value.dropna(), reverse=True
    )[:2]
    second = report(globe_client, "corridors", limit=2, offset=2)
    assert second["items"][0] != corridors["items"][0]
    assert corridors["items"][0]["source_row"]


def test_exact_corridor_trend_and_compatible_acs_family(globe_client, official_data):
    trend = report(globe_client, "trends", origin_id="country:356", destination_id="country:840")
    expected = (
        official_data[0]["migration"]
        .query(
            "dataset_id == 'un_stock_2024' and origin_id == 'country:356' "
            "and destination_id == 'country:840'"
        )
        .sort_values("year_end")
    )
    assert [r["year_end"] for r in trend["items"]] == expected.year_end.tolist()
    assert [r["value"] for r in trend["items"]] == expected.value.tolist()
    assert "not annual flows" in trend["note"]
    acs = report(
        globe_client, "trends", mode="us", dataset_id="census_acs_2024", measure="acs_movers"
    )
    assert [r["year_end"] for r in acs["items"]] == [2023, 2024]
    assert {d["id"] for d in acs["sources"]} == {"census_acs_2023", "census_acs_2024"}
    assert acs["items"][1]["unavailable"] == 255
    irs = report(
        globe_client,
        "trends",
        mode="us",
        dataset_id="irs_state_2223",
        year=2023,
        measure="tax_returns",
    )
    assert len(irs["items"]) == 1
    assert irs["items"][0]["year_start"] == 2022


def test_comparison_filters_and_distribution_conserve_observed_values(globe_client):
    comparison = report(globe_client, "comparisons", geography_ids=["country:356", "country:840"])
    assert {r["geography_id"] for r in comparison["items"]} == {"country:356", "country:840"}
    filtered = report(globe_client, "rankings", side="origin", destination_id="country:840")
    assert all(r["geography_id"] != "country:840" for r in filtered["items"])
    distribution = report(globe_client, "distribution")
    assert sum(r["value"] for r in distribution["items"]) == distribution["observed"]
    assert report(globe_client, "corridors", min_value=10**12)["items"] == []


def test_complete_acs_net_matches_independent_source_calculation(globe_client, official_data):
    frame = official_data[0]["migration"]
    selected = frame.query("dataset_id == 'census_acs_2023'")
    expected = (
        selected.groupby("destination_id").value.sum() - selected.groupby("origin_id").value.sum()
    )
    page = report(
        globe_client,
        "net",
        mode="us",
        dataset_id="census_acs_2023",
        year=2023,
        measure="acs_movers",
        limit=250,
    )
    assert page["total"] == 51
    assert sum(r["value"] for r in page["items"]) == 0
    for row in page["items"]:
        assert row["value"] == expected[row["geography_id"]]
        assert row["observed"] == 100 and row["unavailable"] == 0
        assert row["value"] == row["incoming"] - row["outgoing"]
    partial = report(
        globe_client,
        "net",
        mode="us",
        dataset_id="census_acs_2024",
        measure="acs_movers",
        limit=250,
    )
    assert partial["total"] == 3


def test_economics_exact_year_provenance_and_missing_remain_missing(globe_client, official_data):
    indicators = globe_client.get("/v1/analytics/indicators").json()
    assert len(indicators) == 4 and all(len(i["source_sha256"]) == 64 for i in indicators)
    data = report(globe_client, "economics", geography_ids=["country:356", "country:840"])
    expected = official_data[0]["economic"].query("indicator == 'NY.GDP.PCAP.CD' and year == 2024")
    assert len(data["items"]) == 2
    for row in data["items"]:
        source = expected.query("geography_id == @row['geography_id']").iloc[0]
        assert row["economic_value"] == pytest.approx(source.value)
        assert row["economic_status"] == "observed"
    assert "correlation does not establish causation" in data["note"]
    all_rows = report(globe_client, "economics", limit=250)["items"]
    assert any(
        r["economic_value"] is None and r["economic_status"] == "not_published" for r in all_rows
    )


@pytest.mark.parametrize(
    "kind,overrides",
    [
        ("net", {}),
        (
            "net",
            {"mode": "us", "dataset_id": "irs_state_2223", "year": 2023, "measure": "tax_returns"},
        ),
        (
            "net",
            {
                "mode": "us",
                "dataset_id": "census_acs_2024",
                "measure": "acs_movers",
                "min_value": 1,
            },
        ),
        ("economics", {"year": 1990}),
        ("economics", {"mode": "us", "dataset_id": "census_acs_2024", "measure": "acs_movers"}),
        ("rankings", {"origin_id": "state:06"}),
        ("rankings", {"geography_ids": ["country:999"]}),
        ("rankings", {"limit": 251}),
        ("rankings", {"year": 2023}),
        ("rankings", {"measure": "tax_returns"}),
        ("economics", {"indicator": "invalid"}),
        ("rankings", {"unknown": "ignored?"}),
    ],
)
def test_invalid_or_incompatible_comparisons_rejected(globe_client, kind, overrides):
    response = globe_client.get(f"/v1/analytics/{kind}", params=params(**overrides))
    assert response.status_code == 422, response.text


def test_csv_preserves_reporting_period_source_and_units(globe_client):
    response = globe_client.get(
        "/v1/analytics/trends/export",
        params=params(origin_id="country:356", destination_id="country:840"),
    )
    assert response.status_code == 200
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert len(rows) == 8
    assert rows[-1]["measurement_type"] == "stock"
    assert rows[-1]["units"] == "persons"
    assert rows[-1]["reporting_period"] == "2024 · mid-year stock"
    assert rows[-1]["source_url"].startswith("https://www.un.org/")
    assert len(rows[-1]["source_sha256"]) == 64
    assert "origin_id" in rows[-1]["filters"]
    assert safe_cell("=1+1") == "'=1+1"
    assert safe_cell(-12) == -12


def test_csv_exports_all_pages_and_empty_headers(globe_client):
    response = globe_client.get(
        "/v1/analytics/corridors/export",
        params=params(
            mode="us",
            dataset_id="census_acs_2023",
            year=2023,
            measure="acs_movers",
            limit=1,
            offset=100,
        ),
    )
    assert response.status_code == 200
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert len(rows) == 2550  # The official complete ACS matrix, ignoring display pagination.
    assert all(r["reporting_period"] == "2023 · ACS 1-year estimate" for r in rows)
    empty = globe_client.get("/v1/analytics/corridors/export", params=params(min_value=10**12))
    reader = csv.DictReader(io.StringIO(empty.text))
    assert list(reader) == [] and "source_sha256" in reader.fieldnames


def test_geography_selection_is_not_silently_ignored(globe_client):
    for kind in ["trends", "distribution", "corridors"]:
        response = globe_client.get(
            f"/v1/analytics/{kind}", params=params(geography_ids=["country:356"])
        )
        assert response.status_code == 422
