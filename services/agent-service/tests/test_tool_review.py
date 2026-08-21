"""Tests for mandatory tool review helpers."""

from agent_service.builder.tool_review import (
    apply_reviewed_tools,
    build_tool_review_entries,
    tools_changed,
)
from agent_service.models.agent_spec import ToolBinding


def test_tools_changed_first_build_with_app():
    proposed = [
        ToolBinding(tool_id="current_datetime", provider="native"),
        ToolBinding(tool_id="gmail_send", provider="pipedream", app_id="gmail"),
    ]
    assert tools_changed(proposed=proposed, current=None) is True


def test_tools_changed_natives_only_skips_review():
    proposed = [
        ToolBinding(tool_id="current_datetime", provider="native"),
        ToolBinding(tool_id="web_search", provider="native"),
        ToolBinding(tool_id="calculator", provider="native"),
    ]
    assert tools_changed(proposed=proposed, current=None) is False


def test_tools_changed_same_app_ignores_extra_actions():
    current = [
        ToolBinding(tool_id="gmail_list", provider="pipedream", app_id="gmail"),
        ToolBinding(tool_id="web_search", provider="native"),
    ]
    proposed = [
        ToolBinding(tool_id="gmail_list", provider="pipedream", app_id="gmail"),
        ToolBinding(tool_id="gmail_send", provider="pipedream", app_id="gmail"),
        ToolBinding(tool_id="calculator", provider="native"),
    ]
    assert tools_changed(proposed=proposed, current=current) is False


def test_build_entries_groups_gmail_actions_and_hides_natives():
    proposed = [
        ToolBinding(tool_id="web_search", provider="native"),
        ToolBinding(tool_id="calculator", provider="native"),
        ToolBinding(tool_id="gmail_list", provider="pipedream", app_id="gmail"),
        ToolBinding(tool_id="gmail_send", provider="pipedream", app_id="gmail"),
        ToolBinding(tool_id="calendar_list", provider="pipedream", app_id="google_calendar"),
    ]
    entries = build_tool_review_entries(proposed=proposed, current=None, goal="Préparer un meeting")
    ids = {e["app_id"] for e in entries}
    assert ids == {"gmail", "google_calendar"}
    gmail = next(e for e in entries if e["app_id"] == "gmail")
    assert gmail["name"] == "Gmail"
    assert set(gmail["tool_ids"]) == {"gmail_list", "gmail_send"}
    assert gmail["change"] == "add"


def test_build_entries_french_utility():
    proposed = [ToolBinding(tool_id="gmail_send", provider="pipedream", app_id="gmail")]
    entries = build_tool_review_entries(
        proposed=proposed, current=None, goal="Préparer un meeting", locale="fr"
    )
    assert "sert à avancer" in entries[0]["utility"]
    assert "Lets the agent" not in entries[0]["utility"]


def test_apply_reviewed_tools_keeps_hidden_and_all_app_actions():
    pending = [
        ToolBinding(tool_id="current_datetime", provider="native"),
        ToolBinding(tool_id="web_search", provider="native"),
        ToolBinding(tool_id="gmail_list", provider="pipedream", app_id="gmail"),
        ToolBinding(tool_id="gmail_send", provider="pipedream", app_id="gmail"),
        ToolBinding(tool_id="calendar_list", provider="pipedream", app_id="google_calendar"),
    ]
    out = apply_reviewed_tools(
        pending_tools=pending,
        reviewed=[
            {
                "tool_id": "gmail_list",
                "provider": "pipedream",
                "app_id": "gmail",
                "tool_ids": ["gmail_list", "gmail_send"],
                "utility": "Envoyer le brief",
            }
        ],
    )
    ids = [t.tool_id for t in out]
    assert "current_datetime" in ids
    assert "structured_output" in ids
    assert "web_search" in ids
    assert "gmail_list" in ids
    assert "gmail_send" in ids
    assert "calendar_list" not in ids
    gmail = next(t for t in out if t.tool_id == "gmail_send")
    assert gmail.config.get("utility") == "Envoyer le brief"
