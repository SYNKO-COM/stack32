"""Normalize Pipedream configurable_props — unit tests."""

from __future__ import annotations

from agent_service.integrations.pipedream.schema import (
    build_configured_props,
    normalize_configurable_props,
)

SLACK_COMPONENT = {
    "key": "slack-send-message-to-channel",
    "name": "Send Message to Channel",
    "version": "1.0.0",
    "app": {"name_slug": "slack"},
    "configurable_props": [
        {"name": "slack", "type": "app", "app": "slack"},
        {
            "name": "channel",
            "type": "string",
            "label": "Channel",
            "remoteOptions": True,
            "optional": False,
        },
        {
            "name": "text",
            "type": "string",
            "label": "Message",
            "optional": False,
        },
        {
            "name": "as_user",
            "type": "boolean",
            "optional": True,
            "default": True,
        },
    ],
}


def test_normalize_classifies_auth_static_runtime() -> None:
    schema = normalize_configurable_props(SLACK_COMPONENT, tool_id="pd:slack-send-message-to-channel")
    kinds = {p.name: p.kind for p in schema.props}
    assert kinds["slack"] == "connection"
    assert kinds["channel"] == "static"
    assert kinds["text"] == "runtime"
    assert schema.auth_prop_name == "slack"


def test_llm_schema_excludes_auth() -> None:
    schema = normalize_configurable_props(SLACK_COMPONENT, tool_id="pd:slack-send")
    llm = schema.llm_json_schema()
    assert "slack" not in llm["properties"]
    assert "channel" not in llm["properties"]
    assert "text" in llm["properties"]
    assert "text" in llm.get("required", [])


def test_llm_schema_can_include_unconfigured_static() -> None:
    schema = normalize_configurable_props(SLACK_COMPONENT, tool_id="pd:slack-send")
    llm = schema.llm_json_schema(include_static_unconfigured=True)
    assert "channel" in llm["properties"]


def test_build_configured_props_injects_auth() -> None:
    schema = normalize_configurable_props(SLACK_COMPONENT, tool_id="pd:slack-send")
    configured = build_configured_props(
        schema,
        auth_provision_id="apn_test123",
        static_config={"channel": "C123"},
        runtime_args={"text": "hello", "authProvisionId": "evil", "auth_provision_id": "evil2"},
    )
    assert configured["slack"] == {"authProvisionId": "apn_test123"}
    assert configured["channel"] == "C123"
    assert configured["text"] == "hello"
    assert "authProvisionId" not in configured
    assert "auth_provision_id" not in configured


def test_number_bool_array_options() -> None:
    component = {
        "key": "demo",
        "configurable_props": [
            {"name": "count", "type": "integer", "optional": False},
            {"name": "enabled", "type": "boolean", "optional": True},
            {"name": "tags", "type": "string[]", "optional": True},
            {"name": "mode", "type": "string", "options": ["a", "b"], "optional": False},
        ],
    }
    schema = normalize_configurable_props(component, tool_id="pd:demo")
    by_name = {p.name: p for p in schema.props}
    assert by_name["count"].json_type == "integer"
    assert by_name["enabled"].json_type == "boolean"
    assert by_name["tags"].json_type == "array"
    assert by_name["mode"].enum == ["a", "b"]


def test_the_destination_is_required_and_the_trimmings_are_not() -> None:
    """Shape taken from the live google_sheets components.

    The spreadsheet and worksheet arrive with no `optional` key at all, which
    is how Pipedream says "required"; `drive` and `hasHeaders` say
    `optional: true` outright. This fixture used to claim the spreadsheet was
    optional too, and so asserted that our curated list had to override the
    catalogue — it does not, and overriding it demanded fields that apps like
    akeneo and algomo genuinely leave open.
    """
    component = {
        "key": "google_sheets-add-single-row",
        "app": {"name_slug": "google_sheets"},
        "configurable_props": [
            {"name": "googleSheets", "type": "app", "app": "google_sheets"},
            {"name": "drive", "type": "string", "remoteOptions": True, "optional": True},
            {
                "name": "sheetId",
                "type": "string",
                "label": "Spreadsheet",
                "remoteOptions": True,
            },
            {
                "name": "worksheetId",
                "type": "integer",
                "label": "Worksheet",
                "remoteOptions": True,
            },
            {
                "name": "hasHeaders",
                "type": "boolean",
                "optional": True,
                "default": True,
            },
        ],
    }
    schema = normalize_configurable_props(component, tool_id="pd:sheets-row")
    by_name = {p.name: p for p in schema.props}
    assert by_name["sheetId"].kind == "static"
    assert by_name["sheetId"].required is True
    assert by_name["worksheetId"].required is True
    assert by_name["hasHeaders"].required is False
    assert by_name["drive"].required is False
