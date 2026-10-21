"""Source-specific Pandas adapters; source aggregates never become bilateral corridors."""

import json
from pathlib import Path

import pandas as pd
import pycountry

MIGRATION_COLUMNS = [
    "dataset_id",
    "origin_id",
    "destination_id",
    "year_start",
    "year_end",
    "measure",
    "unit",
    "value",
    "status",
    "moe",
    "source_row",
]
ECONOMIC_COLUMNS = [
    "dataset_id",
    "geography_id",
    "year",
    "indicator",
    "unit",
    "value",
    "status",
    "source_row",
]
GEOGRAPHY_COLUMNS = ["id", "level", "code", "code_system", "name", "iso3", "parent_id"]


def wb_payload(path: Path) -> tuple[dict, list]:
    value = json.loads(path.read_text())
    if not isinstance(value, list) or len(value) != 2 or not isinstance(value[1], list):
        raise ValueError(f"{path.name}: unexpected World Bank response")
    metadata, rows = value
    if int(metadata["pages"]) != 1 or int(metadata["total"]) != len(rows):
        raise ValueError(f"{path.name}: incomplete/paginated World Bank response")
    return metadata, rows


def country_id(code: str) -> str:
    return f"country:{code.zfill(3)}"


def wb_country(row: dict) -> tuple[str, str, str | None]:
    # World Bank CHI is the UN Channel Islands area, not an ISO sovereign country.
    if row["id"] == "CHI":
        return country_id("830"), "830", None
    iso = pycountry.countries.get(alpha_3=row["id"])
    if iso is None:
        iso = pycountry.countries.get(alpha_2=row["iso2Code"])
    if iso:
        return country_id(iso.numeric), iso.numeric, iso.alpha_3
    if row["id"] == "XKX":
        # Preserve the provider code; do not invent an ISO or UN M49 code.
        return "country:WB:XKX", "XKX", None
    raise ValueError(f"Unmapped World Bank economy {row['id']}")


def geography_frames(wb_path: Path, us_path: Path, un_path: Path):
    _, countries = wb_payload(wb_path)
    records, wb_map = {}, {}
    for row in countries:
        if row["region"]["id"] == "NA":
            wb_map[row["id"]] = None
            wb_map[row["iso2Code"]] = None
            continue
        key, code, iso3 = wb_country(row)
        wb_map[row["id"]] = key
        wb_map[row["iso2Code"]] = key
        records[key] = dict(
            id=key,
            level="country",
            code=code,
            code_system="WB" if code == "XKX" else "UN_M49",
            name=row["name"],
            iso3=iso3,
            parent_id=None,
        )
    un = pd.read_excel(un_path, sheet_name="Table 1", header=None)
    if un.iloc[10, 4] != "Location code of destination":
        raise ValueError("UN destination header changed")
    for code_col, name_col in [(4, 1), (6, 5)]:
        for code, name in un.iloc[11:, [code_col, name_col]].itertuples(index=False, name=None):
            code = int(code)
            if code >= 900:
                continue
            iso = pycountry.countries.get(numeric=f"{code:03}")
            if iso is None and code != 830:
                raise ValueError(f"Unrecognized UN country/area code: {code}")
            key = country_id(str(code))
            records.setdefault(
                key,
                dict(
                    id=key,
                    level="country",
                    code=f"{code:03}",
                    code_system="UN_M49",
                    name=str(name).rstrip("*"),
                    iso3=iso.alpha_3 if iso else None,
                    parent_id=None,
                ),
            )
    us = pd.read_excel(us_path, header=4, dtype=str)
    states = us.loc[(us["Summary Level"] == "040") & us["State FIPS Code"].astype(int).le(56)]
    for row in states.to_dict("records"):
        code = row["State FIPS Code"]
        key = f"state:{code}"
        records[key] = dict(
            id=key,
            level="state",
            code=code,
            code_system="US_FIPS",
            name=row["Area Name"],
            iso3=None,
            parent_id=country_id("840"),
        )
    counties = us.loc[
        (us["Summary Level"] == "050") & us["State FIPS Code"].isin(states["State FIPS Code"])
    ]
    for row in counties.to_dict("records"):
        code = row["State FIPS Code"] + row["County FIPS Code"]
        key = f"county:{code}"
        records[key] = dict(
            id=key,
            level="county",
            code=code,
            code_system="US_FIPS",
            name=row["Area Name"],
            iso3=None,
            parent_id=f"state:{row['State FIPS Code']}",
        )
    return pd.DataFrame(records.values(), columns=GEOGRAPHY_COLUMNS), wb_map


def number(value, *, suppressed: bool = False) -> tuple[float | None, str]:
    if pd.isna(value) or value in {"..", "...", "N", "N/A", ""}:
        return None, "missing"
    parsed = float(value)
    if suppressed and parsed == -1:
        return None, "suppressed"
    return parsed, "observed"


def un_stock(path: Path, spec: dict, geographies: pd.DataFrame):
    frame = pd.read_excel(path, sheet_name="Table 1", header=None)
    years = [int(v) for v in frame.iloc[10, 7:15]]
    if years != spec["years"] or "both sexes" not in str(frame.iloc[7, 7]):
        raise ValueError("UN table layout/years changed")
    known = set(geographies.loc[geographies.level == "country", "id"])
    rows, excluded = [], 0
    for index, row in frame.iloc[11:].iterrows():
        dest, origin = country_id(str(int(row[4]))), country_id(str(int(row[6])))
        if int(row[4]) >= 900 or int(row[6]) >= 900:
            excluded += 1
            continue
        if origin not in known or dest not in known:
            raise ValueError(f"Unknown UN geography at row {index + 1}")
        if origin == dest:
            raise ValueError("UN stock unexpectedly contains a self corridor")
        for col, year in enumerate(years, start=7):
            value, status = number(row[col])
            rows.append(
                [
                    spec["id"],
                    origin,
                    dest,
                    year,
                    year,
                    "stock_persons",
                    "persons",
                    value,
                    status,
                    None,
                    str(index + 1),
                ]
            )
    return pd.DataFrame(rows, columns=MIGRATION_COLUMNS), {
        "raw_rows": len(frame) - 11,
        "excluded_aggregate_rows": excluded,
        "note": "Only published bilateral country/area rows; absence is not zero; both sexes only",
    }


def acs(path: Path, spec: dict, geographies: pd.DataFrame):
    frame = pd.read_excel(path, sheet_name="Table", header=None)
    frame = frame.map(lambda value: value.strip() if isinstance(value, str) else value)
    year = spec["years"][0]
    if f"{year} American Community Survey 1-Year Estimates" not in str(frame.iloc[1, 0]):
        raise ValueError("ACS title/year changed")
    states = geographies.loc[geographies.level == "state"].set_index("name")["id"].to_dict()
    rows, excluded = [], 0

    def add(origin, destination, value, moe, source_row):
        nonlocal excluded
        if origin not in states or destination not in states or origin == destination:
            excluded += 1
            return
        val, status = number(value)
        margin, _ = number(moe)
        rows.append(
            [
                spec["id"],
                states[origin],
                states[destination],
                year,
                year,
                "acs_movers",
                "persons",
                val,
                status,
                margin,
                str(source_row),
            ]
        )

    if year == 2023:
        if frame.iloc[7, 9] != "Estimate" or frame.iloc[6, 9] != "Alabama":
            raise ValueError("ACS 2023 matrix header changed")
        destinations = set(states) | {"Puerto Rico"}
        # Columns 9..110 are the 51 state/DC origins. PR/foreign/island origins excluded.
        for idx, row in frame.iterrows():
            if row[0] not in destinations:
                continue
            for col in range(9, 111, 2):
                add(
                    str(frame.iloc[6, col]).strip(),
                    str(row[0]).strip(),
                    row[col],
                    row[col + 1],
                    f"{idx + 1}:C{col + 1}",
                )
    elif year == 2024:
        if frame.shape[1] != 4 or frame.iloc[7, 2] != "Estimate":
            raise ValueError("ACS 2024 long-table header changed")
        for idx, row in frame.iloc[8:].iterrows():
            if row[0] in set(states) | {"Puerto Rico"}:
                add(row[1], row[0], row[2], row[3], idx + 1)
    else:
        raise ValueError("Unsupported ACS layout; add a reviewed adapter for this year")
    return pd.DataFrame(rows, columns=MIGRATION_COLUMNS), {
        "raw_rows": len(frame),
        "excluded_candidate_cells": excluded,
        "note": "50 states + DC only; self/PR/island/foreign/total cells excluded; MOE is 90%",
    }


def irs(path: Path, spec: dict, geographies: pd.DataFrame):
    frame = pd.read_csv(path, dtype=str, encoding="cp1252")
    frame.columns = frame.columns.str.lower()
    county = spec["geography_level"] == "county"
    required = {"y1_statefips", "y2_statefips", "n1", "n2"}
    if county:
        required |= {"y1_countyfips", "y2_countyfips"}
    if not required.issubset(frame.columns):
        raise ValueError("IRS record layout changed")
    known = set(geographies.id)
    states = set(geographies.loc[geographies.level == "state", "code"])
    rows, excluded, self_rows = [], 0, 0
    for idx, row in frame.iterrows():
        # 57..59 and 96..98 are documented foreign/summary codes, never real states.
        if row.y1_statefips not in states:
            raise ValueError(f"Invalid IRS origin state {row.y1_statefips}")
        if row.y2_statefips not in states:
            if row.y2_statefips not in {"57", "58", "59", "96", "97", "98"}:
                raise ValueError(f"Invalid IRS destination state {row.y2_statefips}")
            excluded += 1
            continue
        origin, dest = f"state:{row.y1_statefips}", f"state:{row.y2_statefips}"
        if county:
            origin = f"county:{row.y1_statefips}{row.y1_countyfips}"
            dest = f"county:{row.y2_statefips}{row.y2_countyfips}"
        if origin not in known or dest not in known:
            raise ValueError(f"Invalid IRS county/state at source row {idx + 2}: {origin}, {dest}")
        if origin == dest:
            self_rows += 1
            continue
        for field, measure, unit in [
            ("n1", "tax_returns", "returns"),
            ("n2", "tax_individuals", "covered_individuals"),
        ]:
            value, status = number(row[field], suppressed=True)
            rows.append(
                [
                    spec["id"],
                    origin,
                    dest,
                    2022,
                    2023,
                    measure,
                    unit,
                    value,
                    status,
                    None,
                    str(idx + 2),
                ]
            )
    return pd.DataFrame(rows, columns=MIGRATION_COLUMNS), {
        "raw_rows": len(frame),
        "excluded_summary_foreign_rows": excluded,
        "excluded_nonmigrant_rows": self_rows,
        "note": (
            "Outflow files only to avoid inflow double counting; AGI not imported; "
            "omitted corridors are not zero"
        ),
    }


def wb_indicator(path: Path, spec: dict, countries: dict[str, str | None]):
    metadata, source = wb_payload(path)
    rows, aggregates = [], 0
    for idx, row in enumerate(source):
        if row["indicator"]["id"] != spec["indicator"]:
            raise ValueError("World Bank indicator mismatch")
        code = row["countryiso3code"] or row["country"]["id"]
        if code not in countries:
            raise ValueError(f"Unknown World Bank code: {code}")
        if countries[code] is None:
            # Aggregates are identified by official country metadata, not code length.
            aggregates += 1
            continue
        year = int(row["date"])
        if year not in spec["years"]:
            raise ValueError(f"Unexpected World Bank year: {year}")
        value, status = number(row["value"])
        rows.append(
            [
                spec["id"],
                countries[code],
                year,
                spec["indicator"],
                spec["unit"],
                value,
                status,
                str(idx),
            ]
        )
    return pd.DataFrame(rows, columns=ECONOMIC_COLUMNS), {
        "raw_rows": len(source),
        "excluded_aggregate_rows": aggregates,
        "last_updated": metadata.get("lastupdated"),
    }
