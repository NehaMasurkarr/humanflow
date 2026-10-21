"""Fail-closed validation of normalized data before writing or loading."""

import re

import numpy as np
import pandas as pd
import pycountry

from pipelines.parsers import ECONOMIC_COLUMNS, GEOGRAPHY_COLUMNS, MIGRATION_COLUMNS

US_STATE_FIPS = frozenset(
    "01 02 04 05 06 08 09 10 11 12 13 15 16 17 18 19 20 21 22 23 24 25 "
    "26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 44 45 46 47 48 "
    "49 50 51 53 54 55 56".split()
)

MEASURES = {
    "stock_persons": "persons",
    "acs_movers": "persons",
    "tax_returns": "returns",
    "tax_individuals": "covered_individuals",
}


class ValidationError(ValueError):
    """A normalized dataset violates its public contract."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def required(frame: pd.DataFrame, columns: list[str], nullable: set[str]) -> None:
    require(set(columns) == set(frame.columns), "Unexpected normalized columns")
    for column in set(columns) - nullable:
        require(not frame[column].isna().any(), f"Missing required field: {column}")
        require(not frame[column].astype(str).str.strip().eq("").any(), f"Empty field: {column}")


def validate_values(frame: pd.DataFrame, *, migration: bool):
    require(frame.status.isin(["observed", "missing", "suppressed"]).all(), "Unknown value status")
    require((frame.value.notna() == frame.status.eq("observed")).all(), "Value/status mismatch")
    values = pd.to_numeric(frame.value, errors="raise").dropna()
    require(np.isfinite(values).all(), "Non-finite value")
    require(values.ge(0).all(), "Negative value")
    if migration:
        require(values.eq(np.floor(values)).all(), "Nonintegral migration count")
        margins = pd.to_numeric(frame.moe, errors="raise").dropna()
        require(np.isfinite(margins).all() and margins.ge(0).all(), "Invalid margin of error")


def validate_geographies(geographies: pd.DataFrame):
    required(geographies, GEOGRAPHY_COLUMNS, {"iso3", "parent_id"})
    require(not geographies.id.duplicated().any(), "Duplicate geography")
    known = set(geographies.id)
    for row in geographies.itertuples(index=False):
        require(row.level in {"country", "state", "county"}, "Invalid geography level")
        if row.level == "country":
            valid = row.code == "830" or pycountry.countries.get(numeric=row.code) is not None
            valid = valid or (row.code == "XKX" and row.code_system == "WB")
            require(valid, f"Invalid country code: {row.code}")
            expected_id = "country:WB:XKX" if row.code == "XKX" else f"country:{row.code}"
            require(row.id == expected_id, "Country ID/code mismatch")
            if pd.notna(row.iso3):
                iso = pycountry.countries.get(numeric=row.code)
                require(iso is not None and iso.alpha_3 == row.iso3, "ISO/M49 mismatch")
            require(pd.isna(row.parent_id), "Country cannot have parent")
        else:
            width = 2 if row.level == "state" else 5
            require(bool(re.fullmatch(rf"\d{{{width}}}", row.code)), "Invalid FIPS format")
            require(row.code_system == "US_FIPS", "Invalid FIPS code system")
            require(row.id == f"{row.level}:{row.code}", "FIPS ID/code mismatch")
            require(row.code[:2] in US_STATE_FIPS, "Invalid state FIPS code")
            require(row.parent_id in known, "Missing geographic parent")
            parent = "country:840" if row.level == "state" else f"state:{row.code[:2]}"
            require(row.parent_id == parent, "Invalid geographic parent")


def validate_migration(frame: pd.DataFrame, geographies: pd.DataFrame, specs: dict):
    required(frame, MIGRATION_COLUMNS, {"value", "moe"})
    validate_values(frame, migration=True)
    key = ["dataset_id", "origin_id", "destination_id", "year_start", "year_end", "measure"]
    require(not frame.duplicated(key).any(), "Duplicate migration observation")
    levels = geographies.set_index("id").level.to_dict()
    require(
        frame.origin_id.isin(levels).all() and frame.destination_id.isin(levels).all(),
        "Invalid migration geography",
    )
    require(frame.origin_id.ne(frame.destination_id).all(), "Self corridor")
    for dataset_id, rows in frame.groupby("dataset_id"):
        require(dataset_id in specs, "Unknown dataset")
        spec = specs[dataset_id]
        require(
            rows.origin_id.map(levels).eq(spec["geography_level"]).all(), "Origin level mismatch"
        )
        require(
            rows.destination_id.map(levels).eq(spec["geography_level"]).all(),
            "Destination level mismatch",
        )
        allowed = {
            "un_stock": {"stock_persons"},
            "acs": {"acs_movers"},
            "irs": {"tax_returns", "tax_individuals"},
        }[spec["kind"]]
        require(rows.measure.isin(allowed).all(), "Measure/dataset mismatch")
        require(rows.unit.eq(rows.measure.map(MEASURES)).all(), "Inconsistent migration units")
        require(
            rows.year_start.isin(spec["years"]).all() and rows.year_end.isin(spec["years"]).all(),
            "Unsupported migration year",
        )
        if spec["period"] == "filing_year_transition":
            require(
                rows.year_start.eq(2022).all() and rows.year_end.eq(2023).all(),
                "Invalid filing-year interval",
            )
        else:
            require(rows.year_start.eq(rows.year_end).all(), "Invalid point/ACS estimate year")
        if spec["kind"] != "acs":
            require(rows.moe.isna().all(), "MOE only supported for ACS")


def validate_economic(frame: pd.DataFrame, geographies: pd.DataFrame, specs: dict):
    required(frame, ECONOMIC_COLUMNS, {"value"})
    validate_values(frame, migration=False)
    require(not frame.status.eq("suppressed").any(), "Unsupported economic value status")
    require(
        not frame.duplicated(["dataset_id", "geography_id", "year", "indicator"]).any(),
        "Duplicate economic observation",
    )
    countries = set(geographies.loc[geographies.level == "country", "id"])
    require(frame.geography_id.isin(countries).all(), "Invalid economic country")
    for dataset_id, rows in frame.groupby("dataset_id"):
        require(dataset_id in specs, "Unknown economic dataset")
        spec = specs[dataset_id]
        require(rows.indicator.eq(spec["indicator"]).all(), "Indicator mismatch")
        require(rows.unit.eq(spec["unit"]).all(), "Inconsistent economic units")
        require(rows.year.isin(spec["years"]).all(), "Unsupported economic year")
        if spec["unit"] == "percent_labor_force":
            require(rows.value.dropna().le(100).all(), "Invalid percentage")
