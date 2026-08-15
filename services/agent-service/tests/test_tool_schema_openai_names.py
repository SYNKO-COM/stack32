"""OpenAI function.name must match ^[a-zA-Z0-9_-]+$ — sanitize Pipedream ids."""

from agent_service.runtime.tool_schema import (
    from_openai_function_name,
    schemas_for_tools,
    to_openai_function_name,
)


def test_pipedream_tool_id_sanitized():
    tid = "pd:canva-create-design"
    safe = to_openai_function_name(tid)
    assert ":" not in safe
    assert safe == "pd_canva-create-design"
    assert from_openai_function_name(safe, [tid]) == tid


def test_schemas_for_tools_uses_safe_names():
    tid = "pd:notion-create-page"
    schemas = schemas_for_tools([tid])
    assert schemas
    name = schemas[0]["function"]["name"]
    assert ":" not in name
    assert from_openai_function_name(name, [tid]) == tid
