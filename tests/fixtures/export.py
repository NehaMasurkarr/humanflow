"""Regenerate small, genuine source excerpts after a reviewed fetch.

Run: python tests/fixtures/export.py (from the repository root).
This does not invent migration values. Every retained data cell comes from a pinned source.
"""

import argparse
from pathlib import Path

import pandas as pd

from pipelines.sources import catalog, digest, read_json, verified_paths, write_json


def export(only: set[str] | None = None):
    root = Path.cwd()
    lock, paths = verified_paths(root)
    out = root / "tests/fixtures/official"
    out.mkdir(parents=True, exist_ok=True)
    provenance = out / "provenance.json"
    selections = read_json(provenance) if only and provenance.exists() else {}
    if only and not only.issubset(paths):
        raise ValueError("Unknown fixture resource")
    for key, path in paths.items():
        if only and key not in only:
            continue
        if key == "un_stock_2024":
            frame = pd.read_excel(path, sheet_name="Table 1", header=None)
            selected = frame.index[(frame[4] == 840) & frame[6].isin([356, 484, 124, 900])]
            bilateral = frame.iloc[11:].loc[(frame.iloc[11:, 4] < 900) & (frame.iloc[11:, 6] < 900)]
            top = (
                bilateral.assign(magnitude=pd.to_numeric(bilateral[14]))
                .nlargest(100, "magnitude")
                .index
            )
            # Enough genuine corridors for desktop/mobile pagination in CI.
            keep = list(range(11)) + sorted(set(selected) | set(top))
            data = frame.loc[keep]
            filename = key + ".xlsx"
            with pd.ExcelWriter(out / filename) as writer:
                data.to_excel(writer, sheet_name="Table 1", index=False, header=False)
            selections[key] = {"source_excel_rows": [int(i + 1) for i in keep]}
        elif key == "census_geocodes_2023":
            frame = pd.read_excel(path, header=None, dtype=str)
            # All states for complete ACS net tests; two Alabama counties for IRS county tests.
            keep = list(range(5)) + list(
                frame.index[
                    (
                        (frame[0] == "040")
                        & frame[1].astype(str).isin([f"{n:02}" for n in range(1, 57)])
                    )
                    | ((frame[0] == "050") & (frame[1] == "01") & frame[2].isin(["001", "003"]))
                ]
            )
            filename = key + ".xlsx"
            frame.loc[keep].to_excel(out / filename, index=False, header=False)
            selections[key] = {"source_excel_rows": [int(i + 1) for i in keep]}
        elif key.startswith("census_acs"):
            filename = key + ".xlsx"
            frame = pd.read_excel(path, sheet_name="Table", header=None)
            with pd.ExcelWriter(out / filename) as writer:
                frame.to_excel(writer, sheet_name="Table", index=False, header=False)
            selections[key] = {"source_sheet": "Table", "all_rows": True}
        elif key.startswith("irs_"):
            frame = pd.read_csv(path, dtype=str, encoding="cp1252")
            if key == "irs_state_2223":
                selected = (
                    (frame.y1_statefips == "01")
                    & frame.y2_statefips.isin(["01", "13", "12", "96", "97", "98"])
                ) | (frame.y1_statefips == "06")
            else:
                selected = (
                    (frame.y1_statefips == "01")
                    & (frame.y1_countyfips == "001")
                    & (
                        ((frame.y2_statefips == "01") & frame.y2_countyfips.isin(["001", "003"]))
                        | frame.y2_statefips.isin(["96", "97", "98"])
                    )
                )
            filename = key + ".csv"
            frame.loc[selected].to_csv(out / filename, index=False, encoding="cp1252")
            selections[key] = {"source_csv_lines": [int(i + 2) for i in frame.index[selected]]}
        else:
            value = read_json(path)
            if key == "wb_countries":
                rows = [r for r in value[1] if r["id"] in {"USA", "IND", "WLD"}]
            elif key.endswith("_metadata"):
                rows = value[1]
            else:
                rows = [r for r in value[1] if r["countryiso3code"] in {"USA", "IND", "WLD"}]
            value[0].update(total=len(rows), page=1, pages=1)
            value[1] = rows
            filename = key + ".json"
            write_json(out / filename, value)
            selections[key] = {"filter": "USA, IND, WLD; metadata unchanged"}
        selections[key].update(
            file=filename,
            sha256=digest((out / filename).read_bytes()),
            original_snapshot=lock["sources"][key],
        )
    write_json(out / "provenance.json", selections)
    write_json(out / "catalog.json", {"sources": catalog(root)})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", nargs="+", help="Regenerate only these resource IDs")
    args = parser.parse_args()
    export(set(args.only) if args.only else None)
