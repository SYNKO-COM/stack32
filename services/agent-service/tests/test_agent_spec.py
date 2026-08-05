import pytest
from pydantic import ValidationError

from agent_service.mock_data import make_sales_research_spec
from agent_service.models import AgentSpec, migrate_v1_to_v2
from agent_service.models.graph_spec import default_linear_graph


def valid_spec_data() -> dict:
    tools = [{"tool_id": "web_search"}, {"tool_id": "calculator", "enabled": False}]
    return {
        "schema_version": "2.0",
        "identity": {
            "name": "Sales Research Agent",
            "role": "Research companies",
            "description": "",
            "tone": "professional",
        },
        "goal": "Research companies, score leads and draft personalized emails",
        "instructions": {
            "system": "Research the given company and produce a lead score.",
        },
        "tools": tools,
        "rules": [{"id": "r1", "text": "Never invent missing information."}],
        "graph": default_linear_graph(
            [type("T", (), {"tool_id": "web_search"})(), type("T", (), {"tool_id": "calculator"})()]
        ).model_dump(),
    }


def test_agent_spec_validates_with_good_data():
    spec = AgentSpec.model_validate(valid_spec_data())
    assert spec.schema_version == "2.0"
    assert spec.model_policy.profile == "balanced"
    assert spec.runtime.max_steps == 8
    assert spec.output.format == "markdown"
    assert [t.tool_id for t in spec.tools] == ["web_search", "calculator"]


def test_mock_factory_spec_is_valid():
    spec = make_sales_research_spec()
    assert spec.identity.name == "Sales Research Agent"
    assert any(r.text == "Never invent missing information." for r in spec.rules)


def test_migrate_v1_to_v2():
    v1 = {
        "schema_version": "1.0",
        "name": "Legacy",
        "slug": "legacy",
        "goal": "Help",
        "instructions": "Be helpful",
        "tools": [{"tool": "web_search"}],
        "rules": ["Be kind"],
    }
    spec = migrate_v1_to_v2(v1)
    assert spec.schema_version == "2.0"
    assert spec.identity.name == "Legacy"
    assert spec.tools[0].tool_id == "web_search"


def test_agent_spec_rejects_invalid_tool_name():
    data = valid_spec_data()
    data["tools"] = [{"tool_id": "hack_the_planet"}]
    with pytest.raises(ValidationError):
        AgentSpec.model_validate(data)


def test_agent_spec_rejects_empty_name():
    data = valid_spec_data()
    data["identity"]["name"] = ""
    with pytest.raises(ValidationError):
        AgentSpec.model_validate(data)


def test_agent_spec_rejects_out_of_bounds_runtime_limits():
    data = valid_spec_data()
    data["runtime"] = {"max_steps": 0}
    with pytest.raises(ValidationError):
        AgentSpec.model_validate(data)
