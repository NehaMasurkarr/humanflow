"""Read-only globe catalog, geographic search, and filtered corridor endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from backend.models import CorridorPage, Dataset, GeographyPage, Mode
from backend.services.globe import GlobeRepository, get_repository

router = APIRouter(prefix="/v1", tags=["globe"])
Repository = Annotated[GlobeRepository, Depends(get_repository)]


@router.get("/datasets", response_model=list[Dataset])
def datasets(repository: Repository, mode: Mode | None = None):
    return repository.datasets(mode)


@router.get("/geographies", response_model=GeographyPage)
def geographies(
    repository: Repository,
    mode: Mode = "global",
    search: Annotated[str, Query(max_length=100)] = "",
    limit: Annotated[int, Query(ge=1, le=250)] = 50,
    offset: Annotated[int, Query(ge=0, le=10000)] = 0,
):
    return repository.geographies(mode, search, limit, offset)


@router.get("/corridors", response_model=CorridorPage)
def corridors(
    repository: Repository,
    mode: Mode,
    dataset_id: Annotated[str, Query(max_length=80)],
    year: Annotated[int, Query(ge=1990, le=2100)],
    measure: Annotated[str, Query(max_length=50)],
    origin_id: Annotated[str | None, Query(max_length=80)] = None,
    destination_id: Annotated[str | None, Query(max_length=80)] = None,
    min_value: Annotated[int, Query(ge=0, le=10**12)] = 0,
    limit: Annotated[int, Query(ge=1, le=150)] = 60,
    offset: Annotated[int, Query(ge=0, le=10000)] = 0,
):
    return repository.corridors(
        mode=mode,
        dataset_id=dataset_id,
        year=year,
        measure=measure,
        origin_id=origin_id,
        destination_id=destination_id,
        min_value=min_value,
        limit=limit,
        offset=offset,
    )
