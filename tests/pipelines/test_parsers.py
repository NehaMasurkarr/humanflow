from pathlib import Path

import pandas as pd
import pytest

from pipelines import parsers
from pipelines.sources import digest, read_json


def test_fixture_provenance_checksums(official_paths):
    root = Path(__file__).parents[1] / "fixtures/official"
    for key, value in read_json(root / "provenance.json").items():
        assert digest(official_paths[key].read_bytes()) == value["sha256"]
        assert value["original_snapshot"]["url"].startswith("https://")


def test_un_is_stock_with_correct_direction_and_year(official_data, official_paths):
    frames, _ = official_data
    rows = frames["migration"].query("dataset_id == 'un_stock_2024'")
    source = pd.read_excel(official_paths["un_stock_2024"], sheet_name="Table 1", header=None)
    raw = source.loc[(source[4] == 840) & (source[6] == 356)].iloc[0]
    observation = rows.loc[
        (rows.origin_id == "country:356")
        & (rows.destination_id == "country:840")
        & (rows.year_end == 2024)
    ].iloc[0]
    assert observation.value == raw[14]
    assert observation.measure == "stock_persons"
    assert set(rows.year_end) == {1990, 1995, 2000, 2005, 2010, 2015, 2020, 2024}
    assert not rows.origin_id.eq("country:900").any()


@pytest.mark.parametrize("year", [2023, 2024])
def test_acs_layouts_keep_complete_state_universe(official_data, official_paths, year):
    frames, _ = official_data
    rows = frames["migration"].query(
        "dataset_id == @dataset", local_dict={"dataset": f"census_acs_{year}"}
    )
    assert len(rows) == 51 * 50
    assert rows.origin_id.nunique() == rows.destination_id.nunique() == 51
    source = pd.read_excel(official_paths[f"census_acs_{year}"], sheet_name="Table", header=None)
    observation = rows.loc[
        (rows.destination_id == "state:01") & (rows.origin_id == "state:02")
    ].iloc[0]
    raw = source.iloc[11, 11:13] if year == 2023 else source.iloc[9, 2:4]
    assert observation.value == raw.iloc[0]
    assert observation.moe == raw.iloc[1]


def test_irs_outflow_orientation_and_nonmigrants_excluded(official_data, official_paths):
    frames, _ = official_data
    rows = frames["migration"].query("dataset_id == 'irs_state_2223'")
    raw = pd.read_csv(official_paths["irs_state_2223"], dtype=str)
    source = raw.loc[(raw.y1_statefips == "01") & (raw.y2_statefips == "13")].iloc[0]
    row = rows.loc[
        (rows.origin_id == "state:01")
        & (rows.destination_id == "state:13")
        & (rows.measure == "tax_returns")
    ].iloc[0]
    assert row.value == int(source.n1)
    assert (row.year_start, row.year_end) == (2022, 2023)
    assert not rows.origin_id.eq(rows.destination_id).any()
    assert set(rows.measure) == {"tax_returns", "tax_individuals"}


def test_wb_aggregates_removed_and_years_preserved(official_data):
    frames, reports = official_data
    rows = frames["economic"]
    assert set(rows.geography_id) == {"country:840", "country:356"}
    assert set(rows.year) == set(range(2015, 2025))
    assert reports["wb_sp_pop_totl"]["excluded_aggregate_rows"] == 10


def test_missing_and_suppressed_values_are_not_zero():
    assert parsers.number("N") == (None, "missing")
    assert parsers.number(-1, suppressed=True) == (None, "suppressed")
    assert parsers.number(0) == (0.0, "observed")
    with pytest.raises(ValueError):
        parsers.number("unknown")


def test_wb_rejects_incomplete_pagination(tmp_path, official_paths):
    from pipelines.sources import write_json

    value = read_json(official_paths["wb_sp_pop_totl"])
    value[0]["pages"] = 2
    path = tmp_path / "incomplete.json"
    write_json(path, value)
    with pytest.raises(ValueError, match="incomplete/paginated"):
        parsers.wb_payload(path)


def test_wb_unknown_codes_fail_closed(tmp_path, official_data, official_specs, official_paths):
    from pipelines.sources import write_json

    value = read_json(official_paths["wb_sp_pop_totl"])
    value[1][0]["countryiso3code"] = "INVALID"
    path = tmp_path / "unknown.json"
    write_json(path, value)
    spec = next(s for s in official_specs if s["id"] == "wb_sp_pop_totl")
    with pytest.raises(ValueError, match="Unknown World Bank code"):
        parsers.wb_indicator(path, spec, {"USA": "country:840"})
