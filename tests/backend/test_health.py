"""Verify the public health contract through the ASGI application."""

import pytest
from fastapi.testclient import TestClient

from backend.main import app, create_app


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_health_response(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {"status": "healthy", "project": "HumanFlow"}


def test_health_is_documented(client):
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "200" in response.json()["paths"]["/health"]["get"]["responses"]


def test_health_rejects_post(client):
    assert client.post("/health").status_code == 405


def test_unknown_route_returns_not_found(client):
    assert client.get("/missing").status_code == 404


def test_factory_registers_health():
    with TestClient(create_app()) as client:
        assert client.get("/health").json() == {"status": "healthy", "project": "HumanFlow"}
