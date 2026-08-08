"""M-E: tool catalog search + JIT schema loading (built-in fallback)."""

from __future__ import annotations

from agent_service.builder.catalog import get_tool_schema, search_tool_catalog
from agent_service.builder.coding import build_registry


async def test_search_returns_relevant_tools():
    results = await search_tool_catalog("send an appointment email and create a calendar event")
    ids = {r["id"] for r in results}
    assert "gmail_send" in ids
    assert "calendar_create_event" in ids
    # Summaries only — no input_schema leaked in search results.
    assert all("input_schema" not in r for r in results)


async def test_search_ranks_by_keywords():
    results = await search_tool_catalog("math calculation")
    assert results[0]["id"] == "calculator"


async def test_jit_schema_loading():
    schema = await get_tool_schema("gmail_send")
    assert schema is not None
    assert schema["tool_id"] == "gmail_send"
    assert "to" in schema["input_schema"]["properties"]
    assert schema["input_schema"]["required"] == ["to", "subject", "body"]


async def test_jit_unknown_tool():
    assert await get_tool_schema("does_not_exist") is None


def test_registry_exposes_stack32_catalog_tools():
    reg = build_registry()
    assert "stack32.search_tool_catalog" in reg.ids()
    assert "stack32.get_tool_schema" in reg.ids()


async def test_catalog_tools_executable_via_registry():
    from agent_service.builder.coding.tools import ToolContext

    reg = build_registry()
    tool = reg.get("stack32.search_tool_catalog")
    result = await tool.run(ToolContext(None, None, None), {"query": "slack message"})  # type: ignore[arg-type]
    assert any(t["id"] == "slack_post_message" for t in result["tools"])
