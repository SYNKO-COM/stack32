"""AgentSpec V4 hybrid tool bindings + migration chain."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from agent_service.models.agent_spec import (
    AgentSpec,
    ToolBinding,
    load_agent_spec,
    migrate_v2_to_v3,
    migrate_v3_to_v4,
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


def test_load_agent_spec_migrates_v2_to_v4():
    spec = load_agent_spec(_base_v2())
    assert spec.schema_version == "4.0"
    assert all(t.provider == "native" for t in spec.tools)


def test_tool_id_empty_rejected():
    data = _base_v2()
    data["schema_version"] = "4.0"
    data["tools"] = [{"tool_id": ""}]
    with pytest.raises(ValidationError):
        AgentSpec.model_validate(data)


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
