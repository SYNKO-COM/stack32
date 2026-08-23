"""Tests for schema-driven auto app hints."""

from __future__ import annotations

from agent_service.integrations.pipedream.auto_hints import (
    hint_from_component,
    hint_from_normalized_schema,
    merge_curated_and_auto,
)
from agent_service.integrations.pipedream.knowledge import hint_for_app, register_runtime_app_hint
from agent_service.integrations.pipedream.schema import normalize_configurable_props

SLACK_COMPONENT = {
    "key": "slack_v2-send-message-to-channel",
    "app": {"name_slug": "slack_v2"},
    "configurable_props": [
        {"name": "slack", "type": "app", "app": "slack_v2"},
        {
            "name": "conversation",
            "type": "string",
            "label": "Channel",
            "remoteOptions": True,
            "optional": True,
        },
        {
            "name": "text",
            "type": "string",
            "label": "Text",
            "optional": False,
        },
    ],
}

UNKNOWN_APP_COMPONENT = {
    "key": "some_new_app-create-record",
    "app": {"name_slug": "some_new_app"},
    "configurable_props": [
        {"name": "someNewApp", "type": "app", "app": "some_new_app"},
        {
            "name": "workspaceId",
            "type": "string",
            "label": "Workspace",
            "remoteOptions": True,
            "optional": True,
        },
        {
            "name": "recordName",
            "type": "string",
            "label": "Record name",
            "optional": False,
        },
    ],
}


def test_hint_from_component_slack() -> None:
    hint = hint_from_component(SLACK_COMPONENT, tool_id="pd:slack_v2-send-message-to-channel")
    assert hint is not None
    assert hint["auth_prop_guess"] == "slack"
    keys = [k for row in hint["required_static_hints"] for k in row.get("keys", [])]
    assert "conversation" in keys
    assert "conversation" in hint["required_props"]


def test_hint_from_unknown_app() -> None:
    hint = hint_from_component(UNKNOWN_APP_COMPONENT)
    assert hint is not None
    assert hint["_auto_generated"] is True
    # workspaceId is a picker Pipedream marks `optional: true`. It stays on
    # offer — the fixture keeps it among the static hints — but it must not be
    # demanded: promoting every picker is what made creating one Trello card
    # ask for members, labels, mime type, card source and custom fields.
    keys = [k for row in hint["required_static_hints"] for k in row.get("keys", [])]
    assert "workspaceId" in keys
    assert "workspaceId" not in hint["required_props"]


def test_merge_curated_wins_over_auto() -> None:
    curated = {
        "auth_prop_guess": "slack",
        "summary": "Curated",
        "required_static_hints": [{"keys": ["conversation"], "label": "Canal", "why": "Curated"}],
    }
    auto = {
        "auth_prop_guess": "wrong",
        "required_static_hints": [{"keys": ["teamId"], "label": "Team", "why": "Auto"}],
    }
    merged = merge_curated_and_auto(curated, auto)
    assert merged is not None
    assert merged["summary"] == "Curated"
    assert merged["auth_prop_guess"] == "slack"
    keys = [k for row in merged["required_static_hints"] for k in row.get("keys", [])]
    assert "conversation" in keys
    assert "teamId" in keys


def test_runtime_hint_for_unknown_app() -> None:
    schema = normalize_configurable_props(
        UNKNOWN_APP_COMPONENT,
        tool_id="pd:some_new_app-create-record",
    )
    register_runtime_app_hint("some_new_app", hint_from_normalized_schema(schema))
    hint = hint_for_app("some_new_app")
    assert hint is not None
    assert "workspaceId" in str(hint.get("required_static_hints"))


def test_remote_options_static_marked_required() -> None:
    schema = normalize_configurable_props(SLACK_COMPONENT, tool_id="pd:slack_v2-send-message-to-channel")
    conv = next(p for p in schema.props if p.name == "conversation")
    assert conv.kind == "static"
    assert conv.required is True
