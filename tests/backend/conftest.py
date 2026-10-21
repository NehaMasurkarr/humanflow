"""Database-backed API fixture using official source excerpts, rolled back per test."""

import os

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.rows import dict_row

from backend.main import create_app
from backend.services.globe import GlobeRepository, get_repository
from backend.sync_anchors import sync_anchors
from pipelines.database import load_bundle, migrate


@pytest.fixture
def globe_client(official_bundle):
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL for PostgreSQL-backed API tests")
    with psycopg.connect(url) as connection, connection.transaction(force_rollback=True):
        migrate(connection)
        load_bundle(connection, official_bundle)
        sync_anchors(connection)
        connection.row_factory = dict_row
        app = create_app()
        app.dependency_overrides[get_repository] = lambda: GlobeRepository(connection)
        with TestClient(app) as client:
            yield client
