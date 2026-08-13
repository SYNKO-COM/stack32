"""Startup / production-like config guards."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from agent_service.config import Settings


def test_production_like_rejects_mock_and_legacy(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production-like")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role")
    monkeypatch.setenv("INTERNAL_SERVICE_TOKEN", "internal")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "jwt-secret-for-tests")
    monkeypatch.setenv("SECRETS_ENCRYPTION_KEY", "x" * 32)
    monkeypatch.setenv("AI_EXECUTION_MODE", "mock")
    monkeypatch.setenv("AGENT_RUNTIME_VERSION", "legacy")
    monkeypatch.setenv("SANDBOX_PROVIDER", "local")
    monkeypatch.setenv("BUILDER_SANDBOX_ENABLED", "false")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_production_like_accepts_langgraph_e2b(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production-like")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role")
    monkeypatch.setenv("INTERNAL_SERVICE_TOKEN", "internal")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "jwt-secret-for-tests")
    monkeypatch.setenv("SECRETS_ENCRYPTION_KEY", "x" * 32)
    monkeypatch.setenv("AI_EXECUTION_MODE", "live")
    monkeypatch.setenv("AGENT_RUNTIME_VERSION", "langgraph")
    monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/stack32")
    monkeypatch.setenv("SANDBOX_PROVIDER", "e2b")
    monkeypatch.setenv("E2B_API_KEY", "e2b_test")
    monkeypatch.setenv("BUILDER_SANDBOX_ENABLED", "true")
    settings = Settings(_env_file=None)
    assert settings.is_production_like
    assert settings.AGENT_RUNTIME_VERSION == "langgraph"
