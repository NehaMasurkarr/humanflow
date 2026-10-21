"""Bounded, parameterized PostgreSQL queries for the globe experience."""

import os
from collections.abc import Iterator

import psycopg
from fastapi import HTTPException
from psycopg.rows import dict_row

from backend.models import Dataset, Geography, Measure, Period

SUPPORTED = {
    "un_stock_2024": ("global", "UN DESA · International migrant stock", ["stock_persons"]),
    "census_acs_2023": ("us", "Census ACS · 2023", ["acs_movers"]),
    "census_acs_2024": ("us", "Census ACS · 2024", ["acs_movers"]),
    "irs_state_2223": ("us", "IRS SOI · 2022–2023", ["tax_individuals", "tax_returns"]),
}
MEASURES = {
    "stock_persons": Measure(id="stock_persons", label="Migrant stock", unit="persons"),
    "acs_movers": Measure(id="acs_movers", label="Estimated interstate movers", unit="persons"),
    "tax_individuals": Measure(
        id="tax_individuals",
        label="Individuals covered by matched returns",
        unit="covered_individuals",
    ),
    "tax_returns": Measure(id="tax_returns", label="Matched tax returns", unit="returns"),
}


def period_label(spec: dict, start: int, end: int) -> str:
    if spec["observation_type"] == "stock":
        return f"{end} · mid-year stock"
    if spec["period"] == "filing_year_transition":
        return f"{start} → {end} · filing years"
    return f"{end} · ACS 1-year estimate"


def geography(row: dict) -> Geography:
    anchor = None
    if row["latitude"] is not None:
        anchor = {
            key: row[key]
            for key in ("latitude", "longitude", "method", "source_url", "source_sha256")
        }
    return Geography(**{k: row[k] for k in ["id", "name", "level", "code", "iso3"]}, anchor=anchor)


class GlobeRepository:
    def __init__(self, connection):
        self.connection = connection

    def datasets(self, mode: str | None = None) -> list[Dataset]:
        rows = self.connection.execute(
            "SELECT r.dataset_id, r.metadata, r.batch_id, s.sha256 FROM "
            "humanflow.dataset_releases r JOIN humanflow.active_batch a USING(batch_id) "
            "JOIN humanflow.source_snapshots s ON s.batch_id=r.batch_id "
            "AND s.resource_id=r.dataset_id WHERE r.dataset_id=ANY(%s)",
            (list(SUPPORTED),),
        ).fetchall()
        periods = self.connection.execute(
            "SELECT DISTINCT dataset_id, year_start, year_end FROM humanflow.migration_current "
            "WHERE dataset_id=ANY(%s) ORDER BY year_end DESC",
            (list(SUPPORTED),),
        ).fetchall()
        result = []
        for row in rows:
            key, spec = row["dataset_id"], row["metadata"]
            source_mode, name, measures = SUPPORTED[key]
            if mode and source_mode != mode:
                continue
            caveat = (
                (
                    "Stocks count people residing abroad at mid-year; "
                    "they are not annual migration flows."
                )
                if source_mode == "global"
                else (
                    "Survey estimates for age 1+; missing cells remain unavailable. "
                    "MOE is at 90% confidence."
                )
                if spec["kind"] == "acs"
                else (
                    "Matched filing-year addresses, not all residents. "
                    "Small corridors may be omitted; "
                    "no complete net migration is inferred."
                )
            )
            result.append(
                Dataset(
                    id=key,
                    mode=source_mode,
                    name=name,
                    provider=spec["provider"],
                    observation_type=spec["observation_type"],
                    definition=spec["methodology"],
                    scope=spec["scope"],
                    period_type=spec["period"],
                    source_url=spec["landing_url"],
                    license=spec["license"],
                    caveat=caveat,
                    batch_id=row["batch_id"],
                    source_sha256=row["sha256"],
                    measures=[MEASURES[m] for m in measures],
                    periods=[
                        Period(
                            year_start=p["year_start"],
                            year_end=p["year_end"],
                            label=period_label(spec, p["year_start"], p["year_end"]),
                        )
                        for p in periods
                        if p["dataset_id"] == key
                    ],
                )
            )
        return sorted(result, key=lambda d: list(SUPPORTED).index(d.id))

    def geographies(self, mode: str, search: str, limit: int, offset: int):
        level = "country" if mode == "global" else "state"
        # Escape LIKE wildcards: search text is a literal user substring, never SQL syntax.
        pattern = "%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        params = (level, pattern)
        total = self.connection.execute(
            "SELECT count(*) AS n FROM humanflow.geographies WHERE level=%s AND name ILIKE %s",
            params,
        ).fetchone()["n"]
        rows = self.connection.execute(
            "SELECT g.*, a.latitude, a.longitude, a.method, a.source_url, a.source_sha256 "
            "FROM humanflow.geographies g LEFT JOIN humanflow.visualization_anchors a "
            "ON a.geography_id=g.id WHERE g.level=%s AND g.name ILIKE %s "
            "ORDER BY g.name,g.id LIMIT %s OFFSET %s",
            (*params, limit, offset),
        ).fetchall()
        return {
            "items": [geography(r) for r in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    def corridors(
        self,
        *,
        mode,
        dataset_id,
        year,
        measure,
        origin_id,
        destination_id,
        min_value,
        limit,
        offset,
    ):
        datasets = {d.id: d for d in self.datasets(mode)}
        dataset = datasets.get(dataset_id)
        if dataset is None:
            raise HTTPException(422, "Dataset is not available in the selected mode")
        period = next((p for p in dataset.periods if p.year_end == year), None)
        if period is None:
            raise HTTPException(422, "Unsupported reference year/reporting period")
        selected_measure = next((m for m in dataset.measures if m.id == measure), None)
        if selected_measure is None:
            raise HTTPException(422, "Measure is incompatible with the selected dataset")
        level = "country" if mode == "global" else "state"
        for key in [origin_id, destination_id]:
            if (
                key
                and not self.connection.execute(
                    "SELECT 1 FROM humanflow.geographies WHERE id=%s AND level=%s", (key, level)
                ).fetchone()
            ):
                raise HTTPException(422, "Invalid geographic filter for the selected mode")
        where = (
            "m.batch_id=%s AND m.dataset_id=%s AND m.year_start=%s AND m.year_end=%s "
            "AND m.measure=%s AND m.status='observed' AND m.value>=%s"
        )
        params = [
            dataset.batch_id,
            dataset_id,
            period.year_start,
            period.year_end,
            measure,
            min_value,
        ]
        if origin_id:
            where += " AND m.origin_id=%s"
            params.append(origin_id)
        if destination_id:
            where += " AND m.destination_id=%s"
            params.append(destination_id)
        joins = (
            " FROM humanflow.migration_observations m "
            "LEFT JOIN humanflow.visualization_anchors oa ON oa.geography_id=m.origin_id "
            "LEFT JOIN humanflow.visualization_anchors da ON da.geography_id=m.destination_id "
        )
        counts = self.connection.execute(
            "SELECT count(*) AS matching, count(*) FILTER (WHERE oa.geography_id IS NOT NULL "
            "AND da.geography_id IS NOT NULL) AS drawable, "
            "max(m.value) FILTER (WHERE oa.geography_id IS NOT NULL "
            "AND da.geography_id IS NOT NULL) AS max_value" + joins + " WHERE " + where,
            params,
        ).fetchone()
        rows = self.connection.execute(
            "SELECT m.*, row_to_json(o) AS origin_geo, row_to_json(d) AS destination_geo, "
            "row_to_json(oa) AS origin_anchor, row_to_json(da) AS destination_anchor"
            + joins
            + "JOIN humanflow.geographies o ON o.id=m.origin_id "
            "JOIN humanflow.geographies d ON d.id=m.destination_id WHERE "
            + where
            + " AND oa.geography_id IS NOT NULL AND da.geography_id IS NOT NULL "
            "ORDER BY m.value DESC,m.origin_id,m.destination_id LIMIT %s OFFSET %s",
            (*params, limit, offset),
        ).fetchall()
        items = []
        for row in rows:
            origin = geography(dict(row["origin_geo"], **row["origin_anchor"]))
            destination = geography(dict(row["destination_geo"], **row["destination_anchor"]))
            items.append(
                dict(
                    id=f"{origin.id}>{destination.id}",
                    origin=origin,
                    destination=destination,
                    **{
                        k: row[k]
                        for k in [
                            "value",
                            "unit",
                            "measure",
                            "year_start",
                            "year_end",
                            "moe",
                            "source_row",
                        ]
                    },
                )
            )
        missing = self.connection.execute(
            "SELECT count(*) AS n FROM humanflow.migration_observations WHERE batch_id=%s "
            "AND dataset_id=%s AND year_start=%s AND year_end=%s AND measure=%s "
            "AND status <> 'observed'",
            params[:5],
        ).fetchone()["n"]
        return dict(
            items=items,
            dataset=dataset,
            period=period,
            measure=selected_measure,
            total=counts["drawable"],
            matching_observations=counts["matching"],
            excluded_without_anchors=counts["matching"] - counts["drawable"],
            unavailable_in_period=missing,
            limit=limit,
            offset=offset,
            max_value=counts["max_value"],
        )


def get_repository() -> Iterator[GlobeRepository]:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise HTTPException(503, "Migration database is not configured")
    try:
        with psycopg.connect(url, connect_timeout=5, row_factory=dict_row) as connection:
            connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            connection.execute("SET LOCAL statement_timeout = '5s'")
            yield GlobeRepository(connection)
    except psycopg.Error as exc:
        raise HTTPException(503, "Migration data is temporarily unavailable") from exc
