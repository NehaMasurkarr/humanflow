"""Build small, locked geographic outlines; never import source demographic attributes.

Run with the data extra installed. Downloads live in ignored data/raw/boundaries.
Subsequent runs require the exact recorded source hashes; no silent source revisions.
"""

import hashlib
import json
import urllib.request
from collections import defaultdict
from pathlib import Path

import pycountry

ROOT = Path(__file__).resolve().parents[1]
LOCK = ROOT / "data/boundaries.lock.json"


def encoded(value):
    return (json.dumps(value, separators=(",", ":"), ensure_ascii=False) + "\n").encode()


def build():
    sources = json.loads(LOCK.read_text())
    index = {}
    for mode, source in sources.items():
        path = ROOT / "data/raw/boundaries" / source["sha256"] / source["filename"]
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen(source["url"], timeout=120) as response:
                content = response.read()
            if hashlib.sha256(content).hexdigest() != source["sha256"]:
                raise ValueError("Boundary source changed; review before updating the lock")
            path.write_bytes(content)
        content = path.read_bytes()
        if hashlib.sha256(content).hexdigest() != source["sha256"]:
            raise ValueError("Boundary snapshot checksum mismatch")
        groups = defaultdict(list)
        names = {}
        mappings, excluded = [], []
        for feature in json.loads(content)["features"]:
            p = feature["properties"]
            if mode == "us":
                code = p["STATE"]
                if code not in {
                    f"{i:02}"
                    for i in [
                        1,
                        2,
                        4,
                        5,
                        6,
                        8,
                        9,
                        10,
                        11,
                        12,
                        13,
                        15,
                        16,
                        17,
                        18,
                        19,
                        20,
                        21,
                        22,
                        23,
                        24,
                        25,
                        26,
                        27,
                        28,
                        29,
                        30,
                        31,
                        32,
                        33,
                        34,
                        35,
                        36,
                        37,
                        38,
                        39,
                        40,
                        41,
                        42,
                        44,
                        45,
                        46,
                        47,
                        48,
                        49,
                        50,
                        51,
                        53,
                        54,
                        55,
                        56,
                    ]
                }:
                    excluded.append(
                        {"source_id": code, "reason": "Outside 50 states + DC universe"}
                    )
                    continue
                if p["GEOID"] != code:
                    raise ValueError("Census STATE/GEOID mismatch")
                key, name, original = f"state:{code}", p["NAME"], code
            else:
                original, iso = p["GU_A3"], p["ISO_A3_EH"]
                country = pycountry.countries.get(alpha_3=iso)
                if original in {"ATA", "NJM"} or not country and original != "KOS":
                    excluded.append(
                        {
                            "source_id": original,
                            "name": p["GEOUNIT"],
                            "reason": "Polar outline or ambiguous statistical identifier",
                        }
                    )
                    continue
                if original == "KOS":
                    key, name = "country:WB:XKX", "Kosovo"
                elif iso in {"GGY", "JEY"}:
                    key, name = "country:830", "Channel Islands"
                else:
                    key, name = f"country:{country.numeric}", country.name
            geometry = feature["geometry"]
            if geometry["type"] not in {"Polygon", "MultiPolygon"}:
                raise ValueError("Unsupported boundary geometry")
            polygons = (
                [geometry["coordinates"]]
                if geometry["type"] == "Polygon"
                else geometry["coordinates"]
            )
            for polygon in polygons:
                rings = []
                for ring in polygon:
                    if len(ring) < 4 or ring[0] != ring[-1]:
                        raise ValueError("Unclosed/degenerate boundary ring")
                    rounded = []
                    for lon, lat, *_ in ring:
                        if not -180.001 <= lon <= 180.001 or not -90 <= lat <= 90:
                            raise ValueError("Invalid geographic coordinate")
                        point = [round(max(-180, min(180, lon)), 4), round(lat, 4)]
                        if not rounded or point != rounded[-1]:
                            rounded.append(point)
                    if rounded[-1] != rounded[0]:
                        rounded.append(rounded[0])
                    if len(rounded) >= 4:
                        rings.append(rounded)
                if rings:
                    groups[key].append(rings)
            names[key] = name
            mappings.append({"source_id": original, "id": key})
        features = [
            dict(
                type="Feature",
                id=key,
                properties={"name": names[key]},
                geometry=dict(type="MultiPolygon", coordinates=groups[key]),
            )
            for key in sorted(groups)
        ]
        result = dict(type="FeatureCollection", features=features)
        asset = f"boundaries/{mode}.geojson"
        output = encoded(result)
        (ROOT / "frontend/public" / asset).write_bytes(output)
        index[mode] = dict(
            asset="/" + asset,
            sha256=hashlib.sha256(output).hexdigest(),
            source_url=source["url"],
            source_sha256=source["sha256"],
            license=source["license"],
            license_url=source["license_url"],
            vintage=source["vintage"],
            ids=sorted(groups),
            mappings=mappings,
            excluded=excluded,
        )
        print(
            f"{mode}: {len(features)} outlines; {len(output):,} bytes; {len(excluded)} exclusions"
        )
    (ROOT / "backend/assets/boundary-index.json").write_bytes(encoded(index))
    (ROOT / "frontend/public/boundaries/provenance.json").write_bytes(encoded(index))


if __name__ == "__main__":
    build()
