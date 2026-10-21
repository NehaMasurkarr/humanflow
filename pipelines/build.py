"""Deterministic, validated normalized bundles from immutable source snapshots."""

import importlib.metadata
import json
import shutil
import tempfile
from pathlib import Path

import pandas as pd

from pipelines import parsers
from pipelines.sources import catalog, digest, read_json, verified_paths, write_json
from pipelines.validation import validate_economic, validate_geographies, validate_migration

TRANSFORM_VERSION = "phase2-v1"


def transform(paths: dict[str, Path], specs: list[dict]):
    by_id = {row["id"]: row for row in specs}
    geographies, wb_map = parsers.geography_frames(
        paths["wb_countries"], paths["census_geocodes_2023"], paths["un_stock_2024"]
    )
    migrations, economics, reports = [], [], {}
    for spec in specs:
        key, kind = spec["id"], spec["kind"]
        if kind == "un_stock":
            frame, report = parsers.un_stock(paths[key], spec, geographies)
            migrations.append(frame)
        elif kind == "acs":
            frame, report = parsers.acs(paths[key], spec, geographies)
            migrations.append(frame)
        elif kind == "irs":
            frame, report = parsers.irs(paths[key], spec, geographies)
            migrations.append(frame)
        elif kind == "wb_indicator":
            _, definitions = parsers.wb_payload(paths[spec["metadata_id"]])
            if len(definitions) != 1 or definitions[0]["id"] != spec["indicator"]:
                raise ValueError("Indicator definition mismatch")
            frame, report = parsers.wb_indicator(paths[key], spec, wb_map)
            report["indicator_metadata"] = definitions[0]
            economics.append(frame)
        else:
            continue
        report.update(
            records=len(frame),
            observed=int(frame.status.eq("observed").sum()),
            missing=int(frame.status.eq("missing").sum()),
            suppressed=int(frame.status.eq("suppressed").sum()),
        )
        if "origin_id" in frame:
            report["origins"] = frame.origin_id.nunique()
            report["destinations"] = frame.destination_id.nunique()
        reports[key] = report
    migration = pd.concat(migrations, ignore_index=True)
    economic = pd.concat(economics, ignore_index=True)
    # Full state matrices must contain each directed off-diagonal cell, including missing values.
    for spec in specs:
        if spec["kind"] == "acs":
            expected = geographies.level.eq("state").sum()
            actual = migration.dataset_id.eq(spec["id"]).sum()
            if actual != expected * (expected - 1):
                raise ValueError(f"Incomplete ACS matrix: {spec['id']}")
    validate_geographies(geographies)
    validate_migration(migration, geographies, by_id)
    validate_economic(economic, geographies, by_id)
    corridors = migration[["origin_id", "destination_id"]].drop_duplicates()
    frames = {
        "geographies": geographies,
        "corridors": corridors,
        "migration": migration,
        "economic": economic,
    }
    return frames, reports


def build(root: Path) -> Path:
    lock, paths = verified_paths(root)
    specs = catalog(root)
    # Include transformer sources and library versions, not timestamps, in the bundle identity.
    code_files = sorted(Path(__file__).parent.glob("*.py"))
    code_hash = digest(b"".join(p.name.encode() + p.read_bytes() for p in code_files))
    identity = {
        "version": TRANSFORM_VERSION,
        "code_sha256": code_hash,
        "catalog": specs,
        "sources": {k: v["sha256"] for k, v in lock["sources"].items()},
        "libraries": {
            p: importlib.metadata.version(p) for p in ["pandas", "openpyxl", "pycountry"]
        },
    }
    batch_id = digest(json.dumps(identity, sort_keys=True).encode())
    output = root / "data/processed" / batch_id
    if output.exists():
        read_bundle(output)
        return output
    frames, reports = transform(paths, specs)
    parent = output.parent
    parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=".building-", dir=parent))
    try:
        hashes = {}
        for name, frame in frames.items():
            frame = frame.sort_values(list(frame.columns), na_position="last").reset_index(
                drop=True
            )
            path = temporary / f"{name}.csv"
            frame.to_csv(path, index=False, lineterminator="\n")
            hashes[path.name] = digest(path.read_bytes())
        manifest = {
            "batch_id": batch_id,
            "identity": identity,
            "sources": lock["sources"],
            "catalog": specs,
            "reports": reports,
            "files": hashes,
            "counts": {k: len(v) for k, v in frames.items()},
        }
        write_json(temporary / "manifest.json", manifest)
        temporary.rename(output)
    except BaseException:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    return output


def read_bundle(path: Path):
    manifest = read_json(path / "manifest.json")
    frames = {}
    expected_files = {"geographies.csv", "corridors.csv", "migration.csv", "economic.csv"}
    if set(manifest["files"]) != expected_files:
        raise ValueError("Unexpected bundle files")
    if manifest["identity"]["catalog"] != manifest["catalog"]:
        raise ValueError("Bundle catalog mismatch")
    if manifest["identity"]["sources"] != {
        key: source["sha256"] for key, source in manifest["sources"].items()
    }:
        raise ValueError("Bundle provenance mismatch")
    identity_hash = digest(json.dumps(manifest["identity"], sort_keys=True).encode())
    if identity_hash != manifest["batch_id"]:
        raise ValueError("Bundle identity mismatch")
    string_columns = {"id", "code", "origin_id", "destination_id", "geography_id", "source_row"}
    for name, sha in manifest["files"].items():
        file = path / name
        if digest(file.read_bytes()) != sha:
            raise ValueError(f"Bundle checksum mismatch: {name}")
        frames[file.stem] = pd.read_csv(file, dtype={c: str for c in string_columns})
    if {k: len(v) for k, v in frames.items()} != manifest["counts"]:
        raise ValueError("Bundle record counts changed")
    specs = {s["id"]: s for s in manifest["catalog"]}
    validate_geographies(frames["geographies"])
    validate_migration(frames["migration"], frames["geographies"], specs)
    validate_economic(frames["economic"], frames["geographies"], specs)
    expected = frames["migration"][["origin_id", "destination_id"]].drop_duplicates()
    actual = frames["corridors"]
    if actual.duplicated().any() or set(map(tuple, expected.values)) != set(
        map(tuple, actual.values)
    ):
        raise ValueError("Corridor dimension does not match observations")
    return manifest, frames
