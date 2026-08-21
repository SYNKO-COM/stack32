"""AgentSpec V4 hybrid tool bindings + migration chain."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from agent_service.models.agent_spec import (
    AgentSpec,
    ModelConfig,
    ToolBinding,
    load_agent_spec,
    migrate_v2_to_v3,
    migrate_v3_to_v4,
    migrate_v4_to_v5,
    normalize_triggers,
)
from agent_service.models.graph_spec import default_linear_graph


def _base_v2() -> dict:
    tools = [ToolBinding(tool_id="web_search"), ToolBinding(tool_id="calculator")]
    return {
        "schema_version": "2.0",
        "identity": {"name": "Hybrid Agent", "role": "Assistant"},
        "goal": "Help with integrations",
        "instructions": {"system": "Be helpful."},
        "tools": [t.model_dump() for t in tools],
        "graph": default_linear_graph(tools).model_dump(),
    }


def test_v4_allows_arbitrary_tool_ids():
    data = _base_v2()
    data["schema_version"] = "4.0"
    data["tools"] = [
        {
            "tool_id": "pd:slack-send-message",
            "provider": "pipedream",
            "external_action_id": "slack-send-message",
            "approval_mode": "always",
        },
        {"tool_id": "http_request", "provider": "custom_api", "approval_mode": "always"},
    ]
    data["graph"] = default_linear_graph([]).model_dump()
    spec = AgentSpec.model_validate(data)
    assert spec.schema_version == "4.0"
    assert spec.tools[0].provider == "pipedream"
    assert spec.tools[1].provider == "custom_api"


def test_migrate_v3_to_v4_sets_providers():
    v3 = migrate_v2_to_v3(_base_v2())
    v3_data = v3.model_dump()
    v3_data["tools"].append(
        {"tool_id": "http_request", "enabled": True, "approval_mode": "always", "config": {}}
    )
    v3_data["connection_requirements"] = [
        {"provider": "google", "tool_ids": ["gmail_list"], "required": True}
    ]
    v4 = migrate_v3_to_v4(v3_data)
    assert v4.schema_version == "4.0"
    http = next(t for t in v4.tools if t.tool_id == "http_request")
    assert http.provider == "custom_api"
    assert v4.connection_requirements[0].id
    assert v4.connection_requirements[0].required_for == ["gmail_list"]


def test_load_agent_spec_migrates_v2_to_v5():
    spec = load_agent_spec(_base_v2())
    assert spec.schema_version == "5.0"
    assert all(t.provider == "native" for t in spec.tools)
    # Legacy specs carry no exact model; never fabricated.
    assert spec.model is None
    # A default Chat trigger is present after normalization.
    assert any(t.kind == "chat" for t in spec.triggers)


def test_tool_id_empty_rejected():
    data = _base_v2()
    data["schema_version"] = "4.0"
    data["tools"] = [{"tool_id": ""}]
    with pytest.raises(ValidationError):
        AgentSpec.model_validate(data)


def test_normalize_triggers_maps_manual_and_drops_webhook():
    result = normalize_triggers(
        [
            {"kind": "manual", "enabled": True},
            {"kind": "webhook", "enabled": True},
            {"kind": "schedule", "enabled": True, "cron": "0 9 * * *"},
        ]
    )
    kinds = [t["kind"] for t in result]
    assert "chat" in kinds  # manual -> chat
    assert "schedule" in kinds
    assert "webhook" not in kinds


def test_normalize_triggers_keeps_tool_events():
    result = normalize_triggers(
        [
            {"kind": "chat", "enabled": True},
            {
                "kind": "tool",
                "enabled": True,
                "app_id": "gmail",
                "component_id": "gmail-new-email",
                "label": "New email",
            },
        ]
    )
    kinds = [t["kind"] for t in result]
    assert kinds == ["chat", "tool"]
    tool = next(t for t in result if t["kind"] == "tool")
    assert tool["component_id"] == "gmail-new-email"


def test_normalize_triggers_defaults_to_chat():
    result = normalize_triggers([])
    assert result[0]["kind"] == "chat"
    assert result[0]["enabled"] is True


def test_migrate_v4_to_v5_never_fabricates_model():
    data = _base_v2()
    data["schema_version"] = "4.0"
    data["triggers"] = [{"kind": "manual", "enabled": True}]
    v5 = migrate_v4_to_v5(data)
    assert v5.schema_version == "5.0"
    assert v5.model is None
    assert [t.kind for t in v5.triggers] == ["chat"]


def test_model_config_agent_scoped_only():
    mc = ModelConfig(provider="openai", model_id="gpt-4o-mini")
    assert mc.credential_scope == "agent"
    assert mc.fallback_enabled is False
    assert mc.is_configured is True
    assert ModelConfig().is_configured is False


def test_spec_round_trips_model_config():
    data = _base_v2()
    data["schema_version"] = "5.0"
    data["model"] = {"provider": "anthropic", "model_id": "claude-3-5-sonnet-latest"}
    data["triggers"] = [{"kind": "chat", "enabled": True}]
    spec = AgentSpec.model_validate(data)
    assert spec.model is not None
    assert spec.model.provider == "anthropic"
    reloaded = load_agent_spec(spec.model_dump())
    assert reloaded.model is not None
    assert reloaded.model.model_id == "claude-3-5-sonnet-latest"


def test_connection_requirement_required_for_alias():
    data = _base_v2()
    data["schema_version"] = "4.0"
    data["connection_requirements"] = [
        {
            "provider": "google",
            "app_id": "google",
            "required_for": ["gmail_send_message"],
            "required": True,
        }
    ]
    spec = AgentSpec.model_validate(data)
    assert spec.connection_requirements[0].tool_ids == ["gmail_send_message"]
