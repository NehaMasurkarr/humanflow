"""Contracts for source-specific, bounded analytics and CSV exports."""

from typing import Literal

from pydantic import BaseModel, Field

from backend.models import Dataset, Measure, Mode, Period

AnalysisKind = Literal[
    "trends", "corridors", "rankings", "comparisons", "distribution", "net", "economics"
]
IndicatorCode = Literal["NY.GDP.MKTP.CD", "NY.GDP.PCAP.CD", "SP.POP.TOTL", "SL.UEM.TOTL.ZS"]


class AnalyticsFilters(BaseModel):
    model_config = {"extra": "forbid"}
    mode: Mode
    dataset_id: str = Field(max_length=80)
    year: int = Field(ge=1990, le=2100)
    measure: str = Field(max_length=50)
    origin_id: str | None = Field(default=None, max_length=80)
    destination_id: str | None = Field(default=None, max_length=80)
    min_value: int = Field(default=0, ge=0, le=10**12)
    side: Literal["origin", "destination"] = "destination"
    geography_ids: list[str] = Field(default_factory=list, max_length=6)
    indicator: IndicatorCode = "NY.GDP.PCAP.CD"
    limit: int = Field(default=20, ge=1, le=250)
    offset: int = Field(default=0, ge=0, le=10000)


class Indicator(BaseModel):
    code: str
    name: str
    unit: str
    years: list[int]
    provider: str
    source_url: str
    license: str
    source_sha256: str
    dataset_id: str
    batch_id: str


class AnalyticsRow(BaseModel):
    label: str
    value: float | None
    observed: int
    unavailable: int
    dataset_id: str
    year_start: int
    year_end: int
    geography_id: str | None = None
    origin_id: str | None = None
    destination_id: str | None = None
    incoming: float | None = None
    outgoing: float | None = None
    economic_value: float | None = None
    economic_status: str | None = None
    economic_source_row: str | None = None
    moe: float | None = None
    source_row: str | None = None


class AnalyticsPage(BaseModel):
    kind: AnalysisKind
    dataset: Dataset
    sources: list[Dataset]
    period: Period
    measure: Measure
    indicator: Indicator | None = None
    items: list[AnalyticsRow]
    total: int
    limit: int
    offset: int
    observed: int
    unavailable: int
    note: str
    filters: AnalyticsFilters
