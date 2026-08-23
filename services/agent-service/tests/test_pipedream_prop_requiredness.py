"""What the person configures once, and what the agent decides per run.

Pipedream publishes both facts per action; we were reading them wrongly.
`optional` absent is its default for *required*, not for optional — so the
Discord trigger's `channels`, Slack's `conversation`, Airtable's `baseId` and
Trello's `board` all arrived with no `optional` key and were filed under
"Options avancées", where nobody fills them. Meanwhile every remote-options
picker was promoted to required, so creating one Trello card demanded members,
labels, mime type, card source and custom fields.

The line between the two is structural, not a list of names: a type written
`$.<app>.<resource>` or a remote-options picker names something in the user's
account — the "where". Everything else is the "what", and the agent writes it.
"""

from __future__ import annotations

from agent_service.integrations.pipedream.schema import normalize_configurable_props


def component(props: list[dict], app: str = "demo") -> dict:
    return {"key": f"{app}-action", "app": {"name_slug": app}, "configurable_props": props}


def config(props: list[dict], app: str = "demo"):
    schema = normalize_configurable_props(component(props, app), action_id=f"{app}-action")
    static = schema.static_config_schema()
    return set(static.get("required") or []), set((static.get("properties") or {}).keys())


APP = {"name": "demo", "type": "app", "app": "demo"}


def test_absent_optional_means_required():
    """Pipedream omits the key on mandatory props — the Discord trigger's case."""
    req, _ = config([APP, {"name": "channels", "type": "$.discord.channel[]"}], "discord")
    assert "channels" in req


def test_an_account_resource_type_is_configured_by_the_user():
    _, all_props = config([APP, {"name": "channels", "type": "$.discord.channel[]"}], "discord")
    assert "channels" in all_props


def test_explicit_optional_is_offered_but_never_demanded():
    """Trello's members, labels and custom fields are pickers, not obligations."""
    req, all_props = config(
        [
            APP,
            {"name": "board", "type": "string", "remoteOptions": True},
            {"name": "idLabels", "type": "string[]", "remoteOptions": True, "optional": True},
        ],
        "trello",
    )
    assert "board" in req
    assert "idLabels" in all_props
    assert "idLabels" not in req


def test_explicit_required_is_honoured():
    req, _ = config(
        [APP, {"name": "idList", "type": "string", "remoteOptions": True, "optional": False}],
        "trello",
    )
    assert "idList" in req


def test_content_is_left_to_the_agent():
    """Slack's `text` is mandatory for the call, but the agent writes it."""
    _, all_props = config(
        [APP, {"name": "conversation", "type": "string", "remoteOptions": True},
         {"name": "text", "type": "string"}],
        "slack",
    )
    assert "conversation" in all_props
    assert "text" not in all_props


def test_a_named_destination_without_a_picker_still_counts():
    """Notion calls its destination `parent` and offers no remote options."""
    req, _ = config([APP, {"name": "parent", "type": "string"}], "notion")
    assert "parent" in req


def test_advanced_only_props_never_block():
    req, all_props = config(
        [APP, {"name": "drive", "type": "string", "remoteOptions": True}], "google_drive"
    )
    assert "drive" in all_props
    assert "drive" not in req


def test_the_connection_prop_is_not_asked_of_the_user():
    _, all_props = config([APP, {"name": "conversation", "type": "string", "remoteOptions": True}])
    assert "demo" not in all_props


def test_a_resource_type_is_offered_as_a_picker():
    """Values live in the user's account, so the drawer must list them.

    Pipedream does not set remoteOptions on `$.discord.channel[]`, but its
    configure endpoint will enumerate the channels. Without this the trigger
    asked the user to type a channel id by hand.
    """
    schema = normalize_configurable_props(
        component([APP, {"name": "channels", "type": "$.discord.channel[]"}], "discord"),
        action_id="discord-new-message",
    )
    prop = next(p for p in schema.props if p.name == "channels")
    assert prop.remote_options is True


def test_a_plain_string_is_not_turned_into_a_picker():
    schema = normalize_configurable_props(
        component([APP, {"name": "text", "type": "string"}], "slack"),
        action_id="slack-send",
    )
    prop = next(p for p in schema.props if p.name == "text")
    assert prop.remote_options is False
