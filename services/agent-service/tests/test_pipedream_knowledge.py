"""Tests for Pipedream knowledge + playbook sanitization."""

from __future__ import annotations

from agent_service.integrations.pipedream.knowledge import (
    builder_guidance_block,
    hint_for_app,
    normalize_app_key,
    orchestrator_pipedream_system_addon,
)
from agent_service.learning.playbooks import sanitize_config_shape


def test_normalize_app_key():
    assert normalize_app_key("Google-Calendar") == "google_calendar"


def test_hint_notion_requires_page():
    hint = hint_for_app("notion")
    assert hint is not None
    keys = []
    for item in hint.get("required_static_hints") or []:
        keys.extend(item.get("keys") or [])
    assert "pageId" in keys or "databaseId" in keys


def test_hint_canva_design_type():
    hint = hint_for_app("canva")
    assert hint is not None
    assert "designType" in str(hint)


def test_builder_guidance_includes_slack():
    text = builder_guidance_block(tool_ids=["pd:slack-send-message"], app_ids=["slack"])
    assert "slack" in text.lower()
    assert "channel" in text.lower()


def test_orchestrator_addon_mentions_dynamic_props():
    assert "dynamic_props_id" in orchestrator_pipedream_system_addon()


def test_sanitize_strips_auth_and_pii_shaped_values():
    shape = sanitize_config_shape(
        {
            "googleCalendar": {"authProvisionId": "apn_secret"},
            "designType": "preset",
            "name": "doc",
            "pageId": "https://notion.so/abc123456789",
            "api_key": "should-go",
        }
    )
    assert "googleCalendar" not in shape
    assert "api_key" not in shape
    assert shape["designType"]["example"] == "preset"
    assert shape["name"]["example"] == "doc"
    assert shape["pageId"]["required"] is True
    assert "example" not in shape["pageId"]
