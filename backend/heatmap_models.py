"""Geographic reported-magnitude contracts; no spatial density or imputed zeros."""

from typing import Literal

from pydantic import BaseModel, Field

from backend.models import Dataset, Measure, Mode, Period

Direction = Literal["incoming", "outgoing"]


class HeatmapFilters(BaseModel):
    model_config = {"extra": "forbid"}
    mode: Mode
    dataset_id: str = Field(max_length=80)
    year: int = Field(ge=1990, le=2100)
    measure: str = Field(max_length=50)
    direction: Direction = "incoming"
    origin_id: str | None = Field(default=None, max_length=80)
    destination_id: str | None = Field(default=None, max_length=80)
    min_value: int = Field(default=0, ge=0, le=10**12)


class HeatmapValue(BaseModel):
    id: str
    name: str
    code: str
    iso3: str | None
    value: int | None
    status: Literal["reported", "partial", "unavailable", "not_published", "filtered_out"]
    observed: int
    included: int
    missing: int
    suppressed: int
    below_threshold: int
    published: int
    has_boundary: bool


class HeatmapPage(BaseModel):
    dataset: Dataset
    period: Period
    measure: Measure
    direction: Direction
    items: list[HeatmapValue]
    max_value: int
    scale: Literal["log1p"] = "log1p"
    filters: HeatmapFilters
    boundary_asset: str
    boundary_sha256: str
    boundary_source_url: str
    boundary_license: str
    unmatched_geographies: list[str]
    note: str
