"""Account / tool isolation helpers for Pipedream bindings."""

from __future__ import annotations

from agent_service.integrations.pipedream.schema import build_configured_props, normalize_configurable_props


def test_two_agents_would_use_different_auth_props() -> None:
    """Configured props must carry the exact authProvisionId passed by the server."""
    schema = normalize_configurable_props(
        {
            "key": "slack-send-message-to-channel",
            "app": {"name_slug": "slack"},
            "configurable_props": [
                {"name": "slack", "type": "app", "app": "slack"},
                {"name": "channel", "type": "string", "remoteOptions": True, "optional": False},
                {"name": "text", "type": "string", "optional": False},
            ],
        },
        tool_id="pd:slack-send-message-to-channel",
    )
    a = build_configured_props(
        schema,
        auth_provision_id="apn_agent_a",
        static_config={"channel": "C_A"},
        runtime_args={"text": "hi A"},
    )
    b = build_configured_props(
        schema,
        auth_provision_id="apn_agent_b",
        static_config={"channel": "C_B"},
        runtime_args={"text": "hi B"},
    )
    assert a["slack"]["authProvisionId"] == "apn_agent_a"
    assert b["slack"]["authProvisionId"] == "apn_agent_b"
    assert a["channel"] != b["channel"]
