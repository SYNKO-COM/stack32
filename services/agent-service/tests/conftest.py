import pytest
from fastapi.testclient import TestClient

from agent_service.config import Settings
from agent_service.main import create_app

AUTH_HEADERS = {"Authorization": "Bearer test-token"}

_SETTINGS_CONSUMERS = [
    "agent_service.auth",
    "agent_service.config",
    "agent_service.main",
    "agent_service.supabase_client",
    "agent_service.routers.health",
    "agent_service.security.rate_limit",
    "agent_service.gateway.model_gateway",
]


@pytest.fixture
def make_settings(monkeypatch):
    """Install hermetic Settings (ignores the local .env file) everywhere."""

    def _apply(**overrides) -> Settings:
        defaults = {"ALLOW_UNVERIFIED_JWT": True, "AI_EXECUTION_MODE": "mock"}
        defaults.update(overrides)
        settings = Settings(_env_file=None, **defaults)
        for module_path in _SETTINGS_CONSUMERS:
            module = __import__(module_path, fromlist=["get_settings"])
            monkeypatch.setattr(module, "get_settings", lambda s=settings: s, raising=False)
        return settings

    return _apply


@pytest.fixture
def client(make_settings) -> TestClient:
    """Default app client: development mode, no Supabase configured."""
    make_settings()
    return TestClient(create_app(), raise_server_exceptions=False)
