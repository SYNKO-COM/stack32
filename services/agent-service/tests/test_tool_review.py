"""Tests for mandatory tool review helpers."""

from agent_service.builder.tool_review import (
    apply_reviewed_tools,
    build_tool_review_entries,
    tools_changed,
)
from agent_service.models.agent_spec import ToolBinding


def test_tools_changed_first_build():
    proposed = [
        ToolBinding(tool_id="current_datetime", provider="native"),
        ToolBinding(tool_id="web_search", provider="native"),
    ]
    assert tools_changed(proposed=proposed, current=None) is True


def test_tools_changed_same_set_ignores_builtins():
    current = [
        ToolBinding(tool_id="current_datetime", provider="native"),
        ToolBinding(tool_id="web_search", provider="native"),
    ]
    proposed = [
        ToolBinding(tool_id="structured_output", provider="native"),
        ToolBinding(tool_id="web_search", provider="native"),
    ]
    assert tools_changed(proposed=proposed, current=current) is False


def test_build_entries_marks_add_and_remove():
    current = [ToolBinding(tool_id="notion_create_page", provider="pipedream", app_id="notion")]
    proposed = [ToolBinding(tool_id="web_search", provider="native")]
    entries = build_tool_review_entries(proposed=proposed, current=current, goal="Research")
    by_id = {e["tool_id"]: e for e in entries}
    assert by_id["web_search"]["change"] == "add"
    assert by_id["notion_create_page"]["change"] == "remove"
    assert "utility" in by_id["web_search"]


def test_apply_reviewed_tools_keeps_protected_and_utility():
    pending = [
        ToolBinding(tool_id="current_datetime", provider="native"),
        ToolBinding(tool_id="web_search", provider="native"),
        ToolBinding(tool_id="gmail_send", provider="native", app_id="gmail"),
    ]
    out = apply_reviewed_tools(
        pending_tools=pending,
        reviewed=[
            {
                "tool_id": "web_search",
                "provider": "native",
                "utility": "Find sources",
            }
        ],
    )
    ids = [t.tool_id for t in out]
    assert "current_datetime" in ids
    assert "structured_output" in ids
    assert "web_search" in ids
    assert "gmail_send" not in ids
    web = next(t for t in out if t.tool_id == "web_search")
    assert web.config.get("utility") == "Find sources"
