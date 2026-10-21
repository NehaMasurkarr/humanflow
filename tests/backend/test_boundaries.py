"""Committed geographic outlines and source locks use verified identifiers, not name joins."""

import hashlib
import json
from pathlib import Path

import pycountry

ROOT = Path(__file__).resolve().parents[2]


def test_boundary_assets_match_provenance_and_valid_codes():
    index = json.loads((ROOT / "backend/assets/boundary-index.json").read_text())
    assert index == json.loads((ROOT / "frontend/public/boundaries/provenance.json").read_text())
    for mode, source in index.items():
        content = (ROOT / "frontend/public" / source["asset"].lstrip("/")).read_bytes()
        assert hashlib.sha256(content).hexdigest() == source["sha256"]
        features = json.loads(content)["features"]
        ids = [f["id"] for f in features]
        assert sorted(ids) == source["ids"] and len(ids) == len(set(ids))
        if mode == "us":
            assert len(ids) == 51 and "state:11" in ids and "state:72" not in ids
        for feature in features:
            key = feature["id"]
            if mode == "global" and key not in {"country:830", "country:WB:XKX"}:
                assert pycountry.countries.get(numeric=key.split(":")[1]) is not None
            assert set(feature["properties"]) == {
                "name"
            }  # No Natural Earth population/GDP attributes.
            for polygon in feature["geometry"]["coordinates"]:
                for ring in polygon:
                    assert len(ring) >= 4 and ring[0] == ring[-1]
                    assert all(-180 <= lon <= 180 and -90 <= lat <= 90 for lon, lat in ring)
    mappings = {r["source_id"]: r["id"] for r in index["global"]["mappings"]}
    assert mappings["GUF"] == "country:254" and mappings["FXX"] == "country:250"
    assert mappings["ENG"] == mappings["WLS"] == "country:826"
    assert mappings["GGY"] == mappings["JEY"] == "country:830"
