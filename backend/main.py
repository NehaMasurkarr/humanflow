"""FastAPI application entry point: uvicorn backend.main:app."""

from fastapi import FastAPI

from backend.api.analytics import router as analytics_router
from backend.api.globe import router as globe_router
from backend.api.health import router as health_router


def create_app() -> FastAPI:
    """Build an application with independent route registration."""
    application = FastAPI(
        title="HumanFlow API",
        description="Global and US Migration Analytics",
        version="0.1.0",
    )
    application.include_router(health_router)
    application.include_router(globe_router)
    application.include_router(analytics_router)
    return application


app = create_app()
