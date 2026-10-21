"""Source-specific geographic heatmap magnitudes with explicit coverage and provenance."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from backend.heatmap_models import HeatmapFilters, HeatmapPage
from backend.services.globe import GlobeRepository, get_repository
from backend.services.heatmap import HeatmapRepository

router = APIRouter(prefix="/v1", tags=["heatmap"])


@router.get("/heatmap", response_model=HeatmapPage)
def heatmap(
    filters: Annotated[HeatmapFilters, Query()],
    repository: Annotated[GlobeRepository, Depends(get_repository)],
):
    return HeatmapRepository(repository).values(filters)
