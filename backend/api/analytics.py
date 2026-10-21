"""Bounded read-only analytics and explicit, provenance-bearing CSV downloads."""

import csv
import io
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from backend.analytics_models import (
    AnalysisKind,
    AnalyticsFilters,
    AnalyticsPage,
    AnalyticsRow,
    Indicator,
)
from backend.services.analytics import AnalyticsRepository
from backend.services.globe import GlobeRepository, get_repository

router = APIRouter(prefix="/v1/analytics", tags=["analytics"])
Repository = Annotated[GlobeRepository, Depends(get_repository)]
Filters = Annotated[AnalyticsFilters, Query()]


@router.get("/indicators", response_model=list[Indicator])
def indicators(repository: Repository):
    return AnalyticsRepository(repository).indicators()


@router.get("/{kind}", response_model=AnalyticsPage)
def report(kind: AnalysisKind, filters: Filters, repository: Repository):
    return AnalyticsRepository(repository).report(kind, filters)


def safe_cell(value):
    # Spreadsheet formula injection protection without changing numeric negatives.
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + value
    return value


@router.get("/{kind}/export")
def export(kind: AnalysisKind, filters: Filters, repository: Repository):
    service = AnalyticsRepository(repository)
    page = service.report(kind, filters.model_copy(update={"limit": 250, "offset": 0}))
    if page.total > 5000:
        raise HTTPException(422, "Export exceeds 5,000 rows; narrow the geographic filters")
    rows = list(page.items)
    for offset in range(250, page.total, 250):
        rows.extend(
            service.report(kind, filters.model_copy(update={"limit": 250, "offset": offset})).items
        )
    columns = list(AnalyticsRow.model_fields)
    extra = [
        "source",
        "source_url",
        "source_sha256",
        "batch_id",
        "measurement_type",
        "measure",
        "reporting_period",
        "units",
        "scope",
        "license",
        "economic_indicator",
        "economic_unit",
        "economic_source",
        "economic_source_url",
        "economic_source_sha256",
        "filters",
        "note",
    ]
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=columns + extra)
    writer.writeheader()
    sources = {d.id: d for d in page.sources}
    for row in rows:
        dataset = sources[row.dataset_id]
        period = next(p for p in dataset.periods if p.year_end == row.year_end)
        values = dict(
            **row.model_dump(),
            source=dataset.provider,
            source_url=dataset.source_url,
            source_sha256=dataset.source_sha256,
            batch_id=dataset.batch_id,
            measurement_type=dataset.observation_type,
            measure=page.measure.id,
            reporting_period=period.label,
            units="corridors" if kind == "distribution" else page.measure.unit,
            scope=dataset.scope,
            license=dataset.license,
            economic_indicator=page.indicator.code if page.indicator else "",
            economic_unit=page.indicator.unit if page.indicator else "",
            economic_source=page.indicator.provider if page.indicator else "",
            economic_source_url=page.indicator.source_url if page.indicator else "",
            economic_source_sha256=page.indicator.source_sha256 if page.indicator else "",
            filters=filters.model_dump_json(),
            note=page.note,
        )
        writer.writerow({k: safe_cell(v) for k, v in values.items()})
    return Response(
        stream.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="humanflow-{kind}-{filters.year}.csv"'
        },
    )
