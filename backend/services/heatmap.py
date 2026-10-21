"""All-geography PostgreSQL sums independent of the paginated arc display."""

import json
from functools import lru_cache
from importlib.resources import files

from fastapi import HTTPException

from backend.heatmap_models import HeatmapFilters, HeatmapPage
from backend.services.globe import GlobeRepository


@lru_cache
def boundary_index():
    return json.loads(files("backend").joinpath("assets/boundary-index.json").read_text())


class HeatmapRepository:
    def __init__(self, globe: GlobeRepository):
        self.globe = globe
        self.connection = globe.connection

    def values(self, filters: HeatmapFilters) -> HeatmapPage:
        f = filters
        dataset = next((d for d in self.globe.datasets(f.mode) if d.id == f.dataset_id), None)
        if dataset is None:
            raise HTTPException(422, "Dataset is not available in the selected mode")
        period = next((p for p in dataset.periods if p.year_end == f.year), None)
        measure = next((m for m in dataset.measures if m.id == f.measure), None)
        if period is None or measure is None:
            raise HTTPException(422, "Unsupported dataset period or measure")
        level = "country" if f.mode == "global" else "state"
        where = (
            "m.dataset_id=%(dataset)s AND m.year_start=%(start)s "
            "AND m.year_end=%(end)s AND m.measure=%(measure)s"
        )
        params = dict(
            dataset=f.dataset_id,
            start=period.year_start,
            end=period.year_end,
            measure=f.measure,
            minimum=f.min_value,
            level=level,
        )
        for field in ("origin_id", "destination_id"):
            key = getattr(f, field)
            if key:
                if not self.connection.execute(
                    "SELECT 1 FROM humanflow.geographies WHERE id=%s AND level=%s", (key, level)
                ).fetchone():
                    raise HTTPException(422, "Invalid geographic filter for the selected mode")
                where += f" AND m.{field}=%({field})s"
                params[field] = key
        # Trusted column identifier; values are always bound parameters.
        column = "destination_id" if f.direction == "incoming" else "origin_id"
        rows = self.connection.execute(
            "WITH selected AS (SELECT * FROM humanflow.migration_current m WHERE " + where + "), "
            "totals AS (SELECT " + column + " AS id,"
            "sum(value) FILTER (WHERE status='observed' AND value>=%(minimum)s) AS value,"
            "count(*)::integer AS published,"
            "count(*) FILTER (WHERE status='observed')::integer AS observed,"
            "count(*) FILTER (WHERE status='observed' AND value>=%(minimum)s)::integer AS included,"
            "count(*) FILTER (WHERE status='observed' AND value<%(minimum)s)::integer "
            "AS below_threshold,"
            "count(*) FILTER (WHERE status='missing')::integer AS missing,"
            "count(*) FILTER (WHERE status='suppressed')::integer AS suppressed "
            "FROM selected GROUP BY " + column + ") "
            "SELECT g.id,g.name,g.code,g.iso3,t.value,coalesce(t.published,0) AS published,"
            "coalesce(t.observed,0) AS observed,coalesce(t.included,0) AS included,"
            "coalesce(t.below_threshold,0) AS below_threshold,coalesce(t.missing,0) AS missing,"
            "coalesce(t.suppressed,0) AS suppressed FROM humanflow.geographies g "
            "LEFT JOIN totals t ON t.id=g.id WHERE g.level=%(level)s ORDER BY g.id",
            params,
        ).fetchall()
        if len(rows) > 250:
            raise HTTPException(503, "Heatmap geography limit exceeded")
        boundary = boundary_index()[f.mode]
        for row in rows:
            row["has_boundary"] = row["id"] in boundary["ids"]
            row["status"] = (
                "not_published"
                if not row["published"]
                else "unavailable"
                if not row["observed"]
                else "filtered_out"
                if not row["included"]
                else "partial"
                if row["missing"] + row["suppressed"]
                else "reported"
            )
        return HeatmapPage(
            dataset=dataset,
            period=period,
            measure=measure,
            direction=f.direction,
            items=rows,
            filters=f,
            max_value=max((int(r["value"] or 0) for r in rows), default=0),
            boundary_asset=boundary["asset"] + "?v=" + boundary["sha256"][:12],
            boundary_sha256=boundary["sha256"],
            boundary_source_url=boundary["source_url"],
            boundary_license=boundary["license"],
            unmatched_geographies=[r["id"] for r in rows if not r["has_boundary"]],
            note=(
                "Polygon color shows sums of reported incoming or outgoing corridor values, "
                "not within-country/state population density or travel paths. "
                "Missing, suppressed, unpublished, and threshold-excluded values are not zero. "
                "Unpublished corridors may be absent; reported sums are not complete totals. "
                "Modern generalized boundaries are visualization outlines, not historical borders. "
                "Color uses log(1 + value) with a per-selection maximum; compare numeric values "
                "rather than colors across sources or periods. " + dataset.caveat
            ),
        )
