"""Definition vs Installation domain tests."""

from __future__ import annotations

import pytest

from agent_service.models.agent_spec import ToolBinding, load_agent_spec
from agent_service.models.graph_spec import default_linear_graph
from agent_service.publishing.sanitizer import PublishSanitizeError, sanitize_definition_spec
from agent_service.readiness import (
    evaluate_definition_readiness,
    evaluate_installation_readiness,
)
from agent_service.security import user_secrets


def _spec(*tool_ids: str, connection_requirements: list | None = None, model: dict | None = None):
    tools = [ToolBinding(tool_id=t, provider="native") for t in tool_ids]
    graph = default_linear_graph([]).model_dump()
    raw = {
        "schema_version": "4.0",
        "identity": {"name": "Ready Agent", "role": "Assistant"},
        "goal": "Be ready",
        "instructions": {"system": "Help."},
        "tools": [t.model_dump() for t in tools],
        "graph": graph,
        "connection_requirements": connection_requirements or [],
        "approvals": {"require_for_side_effects": True, "require_for_email_send": True},
        "triggers": [{"kind": "chat", "enabled": True}],
    }
    if model is not None:
        raw["model"] = model
    return load_agent_spec(raw)


@pytest.mark.asyncio
async def test_definition_readiness_ignores_missing_connections(monkeypatch):
    async def _no_conns(*, user_id: str):
        return []

    from agent_service.connections import manager as mgr_mod

    monkeypatch.setattr(mgr_mod.ConnectionManager, "list_connections", _no_conns)
    result = await evaluate_definition_readiness(
        agent_id="a1",
        user_id="u1",
        spec=_spec(
            "gmail_list",
            connection_requirements=[
                {
                    "provider": "google",
                    "app_id": "google",
                    "tool_ids": ["gmail_list"],
                    "required": True,
                }
            ],
        ),
        build_ok=True,
    )
    assert result.status == "ready"
    assert not result.missing_connections
    assert any(c.key == "connection_requirements" and c.ok for c in result.checks)


@pytest.mark.asyncio
async def test_installation_readiness_requires_connections(monkeypatch):
    async def _no_conns(*, user_id: str):
        return []

    async def _no_bindings(*, user_id: str, agent_id: str, installation_id=None):
        return []

    from agent_service.connections import manager as mgr_mod

    monkeypatch.setattr(mgr_mod.ConnectionManager, "list_connections", _no_conns)
    monkeypatch.setattr(mgr_mod.ConnectionManager, "list_bindings", _no_bindings)
    result = await evaluate_installation_readiness(
        agent_id="a1",
        user_id="u1",
        installation_id="inst-1",
        spec=_spec(
            "gmail_list",
            connection_requirements=[
                {
                    "provider": "google",
                    "app_id": "google",
                    "tool_ids": ["gmail_list"],
                    "required": True,
                }
            ],
            model={"provider": "openai", "model_id": "gpt-4o-mini"},
        ),
        build_ok=True,
        llm_status="valid",
    )
    assert result.status == "needs_setup"
    assert result.missing_connections


@pytest.mark.asyncio
async def test_publish_sanitizer_rejects_secrets():
    dirty = {
        "schema_version": "4.0",
        "identity": {"name": "X", "role": "Y"},
        "goal": "g",
        "instructions": {"system": "s"},
        "graph": default_linear_graph([]).model_dump(),
        "connection_bindings": [{"connection_id": "conn-secret", "tool_ids": ["gmail_list"]}],
        "tools": [
            {
                "tool_id": "gmail_send",
                "provider": "google",
                "enabled": True,
                "config": {"api_key": "sk-leak", "channel": "#sales"},
            }
        ],
        "memory": {"provider": "stack32", "external_config_id": "ext-1"},
    }
    with pytest.raises(PublishSanitizeError) as exc:
        sanitize_definition_spec(dirty)
    assert exc.value.code == "PUBLISH_SECRET_LEAK"
    assert any("api_key" in d or "connection_bindings" in d for d in exc.value.details)


@pytest.mark.asyncio
async def test_publish_sanitizer_strips_portable_ok():
    clean = {
        "schema_version": "4.0",
        "identity": {"name": "X", "role": "Y"},
        "goal": "g",
        "instructions": {"system": "s"},
        "graph": default_linear_graph([]).model_dump(),
        "connection_bindings": [],
        "connection_requirements": [{"provider": "google", "tool_ids": ["gmail_list"]}],
        "tools": [{"tool_id": "gmail_list", "provider": "google", "enabled": True, "config": {}}],
        "memory": {"provider": "stack32"},
        "approvals": {"require_for_side_effects": True, "require_for_email_send": True},
    }
    out = sanitize_definition_spec(clean)
    assert out["connection_bindings"] == []
    assert out["memory"].get("external_config_id") is None


@pytest.mark.asyncio
async def test_resolve_llm_never_uses_platform_key(monkeypatch):
    """Regression: missing installation secret must NOT fall back to platform env."""

    class _FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, path, params=None):
            class R:
                status_code = 200

                def json(self):
                    return []

            return R()

    monkeypatch.setattr(user_secrets, "get_supabase_admin_client", lambda: _FakeClient())
    monkeypatch.setenv("OPENAI_API_KEY", "sk-platform-must-not-be-used")
    result = await user_secrets.resolve_llm_credentials(
        user_id="u1",
        agent_id="a1",
        installation_id="inst-1",
        allow_legacy_owner_fallback=False,
    )
    assert result is None
