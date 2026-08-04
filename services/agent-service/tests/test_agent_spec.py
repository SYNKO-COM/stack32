import pytest
from pydantic import ValidationError

from agent_service.mock_data import make_sales_research_spec
from agent_service.models import AgentSpec


def valid_spec_data() -> dict:
    return {
        "name": "Sales Research Agent",
        "slug": "sales-research-agent",
        "goal": "Research companies, score leads and draft personalized emails",
        "instructions": "Research the given company and produce a lead score.",
        "tools": [{"tool": "web_search"}, {"tool": "calculator", "enabled": False}],
        "rules": ["Never invent missing information."],
    }


def test_agent_spec_validates_with_good_data():
    spec = AgentSpec.model_validate(valid_spec_data())
    assert spec.schema_version == "1.0"
    assert spec.model_profile.profile == "standard"
    assert spec.model_profile.temperature == 0.4
    assert spec.runtime.max_steps == 8
    assert spec.output.format == "markdown"
    assert [t.tool for t in spec.tools] == ["web_search", "calculator"]


def test_mock_factory_spec_is_valid():
    spec = make_sales_research_spec()
    assert spec.name == "Sales Research Agent"
    assert "Never invent missing information." in spec.rules


def test_agent_spec_rejects_temperature_out_of_range():
    data = valid_spec_data()
    data["model_profile"] = {"temperature": 3.5}
    with pytest.raises(ValidationError):
        AgentSpec.model_validate(data)


def test_agent_spec_rejects_invalid_tool_name():
    data = valid_spec_data()
    data["tools"] = [{"tool": "hack_the_planet"}]
    with pytest.raises(ValidationError):
        AgentSpec.model_validate(data)


def test_agent_spec_rejects_empty_name():
    data = valid_spec_data()
    data["name"] = ""
    with pytest.raises(ValidationError):
        AgentSpec.model_validate(data)


def test_agent_spec_rejects_out_of_bounds_runtime_limits():
    data = valid_spec_data()
    data["runtime"] = {"max_steps": 0}
    with pytest.raises(ValidationError):
        AgentSpec.model_validate(data)
