"""Real PostgreSQL geographic sums, filter compatibility, and non-imputation checks."""

import pytest

pytestmark = pytest.mark.postgres


def params(**overrides):
    return dict(
        mode="global", dataset_id="un_stock_2024", year=2024, measure="stock_persons", **overrides
    )


@pytest.mark.parametrize(
    "dataset,mode,year,measure",
    [
        ("un_stock_2024", "global", 2024, "stock_persons"),
        ("census_acs_2023", "us", 2023, "acs_movers"),
        ("census_acs_2024", "us", 2024, "acs_movers"),
        ("irs_state_2223", "us", 2023, "tax_returns"),
        ("irs_state_2223", "us", 2023, "tax_individuals"),
    ],
)
@pytest.mark.parametrize(
    "direction,column", [("incoming", "destination_id"), ("outgoing", "origin_id")]
)
def test_geographic_sums_match_official_source(
    globe_client, official_data, dataset, mode, year, measure, direction, column
):
    response = globe_client.get(
        "/v1/heatmap",
        params=dict(mode=mode, dataset_id=dataset, year=year, measure=measure, direction=direction),
    )
    assert response.status_code == 200, response.text
    page = response.json()
    frame = official_data[0]["migration"]
    selected = frame.query("dataset_id == @dataset and year_end == @year and measure == @measure")
    expected = selected.groupby(column).value.sum(min_count=1)
    for row in page["items"]:
        value = expected.get(row["id"])
        if value is not None and value == value:
            assert row["value"] == value
        else:
            assert row["value"] is None
    assert sum(row["included"] for row in page["items"]) == selected.value.notna().sum()
    assert page["direction"] == direction
    assert len(page["dataset"]["source_sha256"]) == 64
    assert len(page["boundary_sha256"]) == 64
    assert page["max_value"] == max(r["value"] or 0 for r in page["items"])
    assert len(page["items"]) <= 250
    if mode == "us":
        assert len(page["items"]) == 51 and all(r["has_boundary"] for r in page["items"])
    if dataset.startswith("irs"):
        assert page["period"]["year_start"] == 2022


def test_all_stock_reference_years_and_missing_versus_zero(globe_client, official_data):
    for year in [1990, 1995, 2000, 2005, 2010, 2015, 2020, 2024]:
        query = params()
        query["year"] = year
        page = globe_client.get("/v1/heatmap", params=query).json()
        assert page["period"]["year_end"] == year
        assert "not annual migration flows" in page["note"]
        assert any(r["status"] == "not_published" and r["value"] is None for r in page["items"])
    acs = globe_client.get(
        "/v1/heatmap",
        params=dict(
            mode="us",
            dataset_id="census_acs_2024",
            year=2024,
            measure="acs_movers",
            direction="incoming",
        ),
    ).json()
    assert sum(r["missing"] for r in acs["items"]) == 255
    assert any(r["status"] in {"unavailable", "partial"} for r in acs["items"])
    zero = (
        official_data[0]["migration"]
        .query("dataset_id == 'census_acs_2023' and value == 0")
        .iloc[0]
    )
    response = globe_client.get(
        "/v1/heatmap",
        params=dict(
            mode="us",
            dataset_id="census_acs_2023",
            year=2023,
            measure="acs_movers",
            origin_id=zero.origin_id,
            destination_id=zero.destination_id,
        ),
    )
    row = next(r for r in response.json()["items"] if r["id"] == zero.destination_id)
    assert row["value"] == 0 and row["status"] == "reported" and row["included"] == 1
    assert any(
        r["value"] is None and r["status"] == "not_published" for r in response.json()["items"]
    )


def test_threshold_and_exact_geography_filters(globe_client, official_data):
    page = globe_client.get(
        "/v1/heatmap", params=params(origin_id="country:356", destination_id="country:840")
    ).json()
    row = next(r for r in page["items"] if r["id"] == "country:840")
    expected = (
        official_data[0]["migration"]
        .query(
            "dataset_id == 'un_stock_2024' and year_end == 2024 "
            "and origin_id == 'country:356' and destination_id == 'country:840'"
        )
        .iloc[0]
    )
    assert row["value"] == expected.value and row["included"] == 1
    empty = globe_client.get("/v1/heatmap", params=params(min_value=10**12)).json()
    assert empty["max_value"] == 0
    assert all(r["value"] is None for r in empty["items"])
    assert any(r["status"] == "filtered_out" and r["below_threshold"] > 0 for r in empty["items"])


@pytest.mark.parametrize(
    "overrides",
    [
        {"mode": "us"},
        {"year": 2023},
        {"measure": "tax_returns"},
        {"direction": "net"},
        {"origin_id": "state:06"},
        {"destination_id": "country:999"},
        {"min_value": -1},
        {"limit": 10},
        {"year": 2020.5},
    ],
)
def test_invalid_filters_rejected(globe_client, overrides):
    query = params()
    query.update(overrides)
    assert globe_client.get("/v1/heatmap", params=query).status_code == 422
