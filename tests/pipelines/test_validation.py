import pandas as pd
import pytest

from analytics.comparability import assert_comparable
from pipelines.validation import (
    ValidationError,
    validate_economic,
    validate_geographies,
    validate_migration,
)


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("dataset_id", None, "Missing required"),
        ("origin_id", "state:99", "Invalid migration geography"),
        ("unit", "thousands", "Inconsistent migration units"),
        ("year_start", 1991, "Unsupported migration year"),
        ("value", -1, "Negative value"),
        ("value", 1.5, "Nonintegral migration count"),
        ("value", float("inf"), "Non-finite value"),
        ("status", "missing", "Value/status mismatch"),
        ("moe", -1, "Invalid margin of error"),
    ],
)
def test_reject_invalid_migration(official_data, official_specs, field, value, message):
    frames, _ = official_data
    frame = frames["migration"].copy()
    frame.loc[frame.index[0], field] = value
    with pytest.raises(ValidationError, match=message):
        validate_migration(frame, frames["geographies"], {s["id"]: s for s in official_specs})


def test_duplicates_fail_instead_of_dropping(official_data, official_specs):
    frames, _ = official_data
    duplicate = pd.concat([frames["migration"], frames["migration"].iloc[:1]], ignore_index=True)
    with pytest.raises(ValidationError, match="Duplicate migration"):
        validate_migration(duplicate, frames["geographies"], {s["id"]: s for s in official_specs})


def test_invalid_geographic_parent_fails(official_data):
    frames, _ = official_data
    geography = frames["geographies"].copy()
    geography.loc[geography.id == "county:01001", "parent_id"] = "state:02"
    with pytest.raises(ValidationError, match="Invalid geographic parent"):
        validate_geographies(geography)


def test_missing_economic_values_are_explicit(official_data, official_specs):
    frames, _ = official_data
    frame = frames["economic"].copy()
    frame.loc[frame.index[0], ["value", "status"]] = [None, "missing"]
    validate_economic(frame, frames["geographies"], {s["id"]: s for s in official_specs})
    frame.loc[frame.index[0], "status"] = "observed"
    with pytest.raises(ValidationError, match="Value/status mismatch"):
        validate_economic(frame, frames["geographies"], {s["id"]: s for s in official_specs})


def test_invalid_economic_units_and_percentages(official_data, official_specs):
    frames, _ = official_data
    frame = frames["economic"].copy()
    index = frame.index[frame.indicator == "SL.UEM.TOTL.ZS"][0]
    frame.loc[index, "value"] = 101
    with pytest.raises(ValidationError, match="Invalid percentage"):
        validate_economic(frame, frames["geographies"], {s["id"]: s for s in official_specs})
    frame.loc[index, "value"] = frames["economic"].loc[index, "value"]
    frame.loc[index, "unit"] = "fraction"
    with pytest.raises(ValidationError, match="Inconsistent economic units"):
        validate_economic(frame, frames["geographies"], {s["id"]: s for s in official_specs})


def enriched(official_data, official_specs, dataset):
    frame = official_data[0]["migration"]
    spec = next(s for s in official_specs if s["id"] == dataset)
    return dict(spec, **frame.loc[frame.dataset_id == dataset].iloc[0].to_dict())


def test_stock_cannot_be_net_or_flow_comparison(official_data, official_specs):
    stock = enriched(official_data, official_specs, "un_stock_2024")
    flow = enriched(official_data, official_specs, "census_acs_2023")
    with pytest.raises(ValidationError, match="different"):
        assert_comparable(stock, flow)
    with pytest.raises(ValidationError, match="stocks are unsupported"):
        assert_comparable(stock, stock, net=True)
    assert_comparable(stock, dict(stock, year_start=2024, year_end=2024))


def test_annual_and_multiyear_or_unsupported_years_rejected(official_data, official_specs):
    flow = enriched(official_data, official_specs, "census_acs_2023")
    with pytest.raises(ValidationError, match="different period"):
        assert_comparable(flow, dict(flow, period="multi_year_estimate"))
    with pytest.raises(ValidationError, match="Unsupported comparison year"):
        assert_comparable(flow, dict(flow, year_start=2020, year_end=2020))
    with pytest.raises(ValidationError, match="different unit"):
        assert_comparable(flow, dict(flow, unit="returns"))


def test_economic_duplicates_and_unsupported_years(official_data, official_specs):
    frames, _ = official_data
    specs = {s["id"]: s for s in official_specs}
    duplicated = pd.concat([frames["economic"], frames["economic"].iloc[:1]], ignore_index=True)
    with pytest.raises(ValidationError, match="Duplicate economic observation"):
        validate_economic(duplicated, frames["geographies"], specs)
    frame = frames["economic"].copy()
    frame.loc[frame.index[0], "year"] = 2014
    with pytest.raises(ValidationError, match="Unsupported economic year"):
        validate_economic(frame, frames["geographies"], specs)
