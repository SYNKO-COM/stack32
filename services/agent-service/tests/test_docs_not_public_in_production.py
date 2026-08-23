"""The API surface must not be published in production.

/docs and /openapi.json served the full 87-endpoint surface to anyone (verified
returning 200 on the live service). That is free reconnaissance; keep the
interactive docs for development only.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


def _client(monkeypatch, environment: str) -> TestClient:
    from agent_service.config import get_settings
    from agent_service.main import create_app

    settings = get_settings()
    monkeypatch.setattr(settings, "ENVIRONMENT", environment, raising=False)
    return TestClient(create_app())


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
def test_docs_are_hidden_in_production(monkeypatch, path):
    assert _client(monkeypatch, "production").get(path).status_code == 404


@pytest.mark.parametrize("path", ["/docs", "/openapi.json"])
def test_docs_stay_available_in_development(monkeypatch, path):
    assert _client(monkeypatch, "development").get(path).status_code == 200


def test_health_and_ready_remain_public_everywhere(monkeypatch):
    client = _client(monkeypatch, "production")
    assert client.get("/health").status_code == 200
    assert client.get("/ready").status_code in (200, 503)
