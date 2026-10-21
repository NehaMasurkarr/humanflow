"""PostgreSQL aggregations; never combine incompatible sources or interpolate years."""

from fastapi import HTTPException

from backend.analytics_models import AnalyticsFilters, AnalyticsPage, Indicator
from backend.services.globe import GlobeRepository

# Identifiers below are application constants, never user-provided SQL.
BINS = """CASE WHEN value < 1000 THEN '1 · 0–999'
 WHEN value < 10000 THEN '2 · 1,000–9,999'
 WHEN value < 100000 THEN '3 · 10,000–99,999'
 WHEN value < 1000000 THEN '4 · 100,000–999,999' ELSE '5 · 1,000,000+' END"""


class AnalyticsRepository:
    def __init__(self, globe: GlobeRepository):
        self.globe = globe
        self.connection = globe.connection

    def indicators(self) -> list[Indicator]:
        rows = self.connection.execute(
            "SELECT i.code,i.name,i.unit,e.dataset_id,e.batch_id,r.metadata,s.sha256,"
            "array_agg(DISTINCT e.year ORDER BY e.year) AS years "
            "FROM humanflow.economic_current e "
            "JOIN humanflow.economic_indicators i ON i.code=e.indicator "
            "JOIN humanflow.dataset_releases r USING(batch_id,dataset_id) "
            "JOIN humanflow.source_snapshots s ON s.batch_id=e.batch_id "
            "AND s.resource_id=e.dataset_id "
            "GROUP BY i.code,i.name,i.unit,e.dataset_id,e.batch_id,r.metadata,s.sha256 "
            "ORDER BY i.code"
        ).fetchall()
        return [
            Indicator(
                **{k: r[k] for k in ("code", "name", "unit", "years", "dataset_id", "batch_id")},
                provider=r["metadata"]["provider"],
                source_url=r["metadata"]["landing_url"],
                license=r["metadata"]["license"],
                source_sha256=r["sha256"],
            )
            for r in rows
        ]

    def report(self, kind: str, filters: AnalyticsFilters) -> AnalyticsPage:
        f = filters
        catalog = self.globe.datasets(f.mode)
        dataset = next((d for d in catalog if d.id == f.dataset_id), None)
        if dataset is None:
            raise HTTPException(422, "Dataset is not available in the selected mode")
        period = next((p for p in dataset.periods if p.year_end == f.year), None)
        measure = next((m for m in dataset.measures if m.id == f.measure), None)
        if period is None or measure is None:
            raise HTTPException(422, "Unsupported dataset period or measure")
        if f.geography_ids and kind not in ("rankings", "comparisons", "economics", "net"):
            raise HTTPException(
                422, "Geography comparisons are unsupported for this analytics kind"
            )
        level = "country" if f.mode == "global" else "state"
        ids = [i for i in [f.origin_id, f.destination_id, *f.geography_ids] if i]
        if ids:
            valid = self.connection.execute(
                "SELECT id FROM humanflow.geographies WHERE level=%s AND id=ANY(%s)",
                (level, ids),
            ).fetchall()
            if set(ids) != {r["id"] for r in valid}:
                raise HTTPException(422, "Invalid geographic identifier for this mode")
        # ACS releases share an explicitly compatible survey family. IRS never joins ACS.
        sources = [dataset]
        if kind == "trends" and dataset.id.startswith("census_acs_"):
            sources = [d for d in catalog if d.id.startswith("census_acs_")]
        params = {"datasets": [d.id for d in sources], "measure": f.measure}
        where = "dataset_id=ANY(%(datasets)s) AND measure=%(measure)s"
        if kind != "trends":
            where += " AND year_start=%(start)s AND year_end=%(end)s"
            params.update(start=period.year_start, end=period.year_end)
        for field in ("origin_id", "destination_id"):
            if getattr(f, field):
                where += f" AND {field}=%({field})s"
                params[field] = getattr(f, field)
        if kind == "net":
            if not dataset.id.startswith("census_acs_"):
                raise HTTPException(422, "Net migration requires complete ACS interstate flow data")
            if f.origin_id or f.destination_id or f.min_value:
                raise HTTPException(
                    422, "Net migration requires the unfiltered incoming/outgoing universe"
                )
        # Missing observations remain visible in coverage even with a magnitude threshold.
        where += " AND (status<>'observed' OR value >= %(minimum)s)"
        params["minimum"] = f.min_value
        selected = (
            "WITH selected AS (SELECT * FROM humanflow.migration_current WHERE " + where + ") "
        )
        counts = self.connection.execute(
            selected + "SELECT count(*) FILTER (WHERE status='observed') AS observed,"
            "count(*) FILTER (WHERE status<>'observed') AS unavailable FROM selected",
            params,
        ).fetchone()
        group_col = "origin_id" if f.side == "origin" else "destination_id"
        common = (
            "count(value)::integer AS observed, count(*) FILTER (WHERE value IS NULL)::integer "
            "AS unavailable, min(dataset_id) AS dataset_id,min(year_start) AS year_start,"
            "min(year_end) AS year_end"
        )
        note = (
            "Sums of reported corridor values, not complete population totals. "
            "Absent corridors are not zero; unavailable cells are excluded from sums. "
            "Analytics includes observations without globe anchors. "
            "Aggregated ACS margins of error are not calculated. " + dataset.caveat
        )
        indicator = None
        if kind == "trends":
            sql = (
                "SELECT year_end::text AS label,sum(value) AS value,"
                + common
                + " FROM selected GROUP BY dataset_id,year_start,year_end"
            )
            order = "year_end,label"
            note += " Reference years are not interpolated; stock changes are not annual flows."
        elif kind == "corridors":
            sql = (
                "SELECT o.name || ' → ' || d.name AS label,m.value,"
                "(m.value IS NOT NULL)::integer AS observed,(m.value IS NULL)::integer "
                "AS unavailable,m.dataset_id,m.year_start,m.year_end,m.origin_id,"
                "m.destination_id,m.moe,m.source_row FROM selected m "
                "JOIN humanflow.geographies o ON o.id=m.origin_id "
                "JOIN humanflow.geographies d ON d.id=m.destination_id WHERE m.status='observed'"
            )
            order = "value DESC,label,origin_id,destination_id"
        elif kind in ("rankings", "comparisons", "economics"):
            sql = (
                "SELECT g.name AS label,g.id AS geography_id,sum(m.value) AS value,"
                + common
                + f" FROM selected m JOIN humanflow.geographies g ON g.id=m.{group_col}"
            )
            if f.geography_ids:
                sql += " WHERE g.id=ANY(%(geographies)s)"
                params["geographies"] = f.geography_ids
            sql += " GROUP BY g.id,g.name"
            order = "value DESC NULLS LAST,label,geography_id"
            if kind == "economics":
                if f.mode != "global":
                    raise HTTPException(
                        422, "World Bank data is country-level; US state economics unavailable"
                    )
                indicator = next((i for i in self.indicators() if i.code == f.indicator), None)
                if indicator is None or f.year not in indicator.years:
                    raise HTTPException(
                        422, "No economic observations at this exact migration year"
                    )
                params.update(indicator=f.indicator, economic_year=f.year)
                sql = (
                    "SELECT m.*,e.value AS economic_value,coalesce(e.status,'not_published') "
                    "AS economic_status,e.source_row AS economic_source_row FROM ("
                    + sql
                    + ") m LEFT JOIN humanflow.economic_current e "
                    "ON e.geography_id=m.geography_id AND e.year=%(economic_year)s "
                    "AND e.indicator=%(indicator)s"
                )
                note += (
                    " Economic values use the exact same reference year. "
                    "Country-level associations are descriptive: correlation does not establish "
                    "causation. No population-normalization or causal effect is implied."
                )
        elif kind == "distribution":
            sql = (
                "SELECT "
                + BINS
                + " AS label,count(*)::numeric AS value,"
                + common
                + " FROM selected WHERE status='observed' GROUP BY 1"
            )
            order = "label"
            note += " Distribution values count observed corridors; bins use the migration unit."
        elif kind == "net":
            sql = (
                "SELECT g.id AS geography_id,g.name AS label,sum(incoming)-sum(outgoing) "
                "AS value,sum(incoming) AS incoming,sum(outgoing) AS outgoing,"
                + common
                + " FROM (SELECT destination_id AS geography_id,value AS incoming,"
                "0::numeric AS outgoing,value,dataset_id,year_start,year_end FROM selected "
                "UNION ALL SELECT origin_id,0::numeric,value,value,dataset_id,year_start,year_end "
                "FROM selected) s JOIN humanflow.us_states g ON g.id=s.geography_id "
                "GROUP BY g.id,g.name HAVING count(*)=100 AND count(value)=100"
            )
            order = "value DESC,label,geography_id"
            note = (
                "Net interstate ACS estimate = incoming minus outgoing; 50 states + DC, age 1+. "
                "Only states with all 100 incoming/outgoing off-diagonal observations are shown. "
                "This is not international or total net migration. Combined MOE is not estimated."
            )
            if f.geography_ids:
                sql = "SELECT * FROM (" + sql + ") n WHERE geography_id=ANY(%(geographies)s)"
                params["geographies"] = f.geography_ids
        else:
            raise HTTPException(422, "Unsupported analytics kind")
        total = self.connection.execute(
            selected + "SELECT count(*) AS n FROM (" + sql + ") result", params
        ).fetchone()["n"]
        params.update(limit=f.limit, offset=f.offset)
        rows = self.connection.execute(
            selected + sql + " ORDER BY " + order + " LIMIT %(limit)s OFFSET %(offset)s", params
        ).fetchall()
        return AnalyticsPage(
            kind=kind,
            dataset=dataset,
            sources=sources,
            period=period,
            measure=measure,
            indicator=indicator,
            items=rows,
            total=total,
            limit=f.limit,
            offset=f.offset,
            **counts,
            note=note,
            filters=f,
        )
