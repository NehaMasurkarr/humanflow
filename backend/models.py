"""Public globe API contracts with explicit measurement semantics and provenance."""

from typing import Literal

from pydantic import BaseModel, Field

Mode = Literal["global", "us"]


class Anchor(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    method: str
    source_url: str
    source_sha256: str


class Geography(BaseModel):
    id: str
    name: str
    level: Literal["country", "state"]
    code: str
    iso3: str | None
    anchor: Anchor | None


class GeographyPage(BaseModel):
    items: list[Geography]
    total: int
    limit: int
    offset: int


class Period(BaseModel):
    year_start: int
    year_end: int
    label: str


class Measure(BaseModel):
    id: str
    label: str
    unit: str


class Dataset(BaseModel):
    id: str
    mode: Mode
    name: str
    provider: str
    observation_type: Literal["stock", "flow"]
    definition: str
    scope: str
    period_type: str
    periods: list[Period]
    measures: list[Measure]
    source_url: str
    license: str
    caveat: str
    batch_id: str
    source_sha256: str


class Corridor(BaseModel):
    id: str
    origin: Geography
    destination: Geography
    value: int
    unit: str
    measure: str
    year_start: int
    year_end: int
    moe: float | None
    source_row: str


class CorridorPage(BaseModel):
    items: list[Corridor]
    dataset: Dataset
    period: Period
    measure: Measure
    total: int
    matching_observations: int
    excluded_without_anchors: int
    unavailable_in_period: int
    limit: int
    offset: int
    max_value: int | None
    anchor_disclaimer: str = (
        "Representative geographic anchors; arcs show statistical relationships, not travel paths. "
        "Particle direction indicates origin to destination, not journeys in progress."
    )
