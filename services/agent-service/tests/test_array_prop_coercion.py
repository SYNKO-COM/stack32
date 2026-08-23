"""A multi-select prop must be sent as a list, or the deploy fails opaquely.

Pipedream types Discord's channel picker `$.discord.channel[]`. The drawer
saves one channel as a string, and the deploy endpoint answered HTTP 500 with
no explanation: the Discord trigger could not be started at all. Sending
["1541…"] deploys first try. Every array-typed picker shares the fault — Gmail
label ids, Trello members and labels.
"""

from __future__ import annotations

import pytest

from agent_service.integrations.pipedream.schema import (
    build_configured_props,
    coerce_prop_value,
    normalize_configurable_props,
)


class Prop:
    def __init__(self, declared: str):
        self.raw = {"type": declared}


@pytest.mark.parametrize(
    "declared", ["$.discord.channel[]", "string[]", "integer[]", "$.airtable.baseId[]"]
)
def test_a_lone_value_becomes_a_list(declared):
    assert coerce_prop_value(Prop(declared), "abc") == ["abc"]


def test_a_list_is_left_alone():
    assert coerce_prop_value(Prop("string[]"), ["a", "b"]) == ["a", "b"]


def test_an_empty_value_becomes_an_empty_list():
    assert coerce_prop_value(Prop("string[]"), "") == []
    assert coerce_prop_value(Prop("string[]"), None) == []


def test_a_scalar_prop_is_untouched():
    assert coerce_prop_value(Prop("string"), "abc") == "abc"
    assert coerce_prop_value(Prop("$.airtable.baseId"), "app1") == "app1"


def test_the_discord_trigger_deploys_with_a_list():
    component = {
        "key": "discord-new-message",
        "app": {"name_slug": "discord"},
        "configurable_props": [
            {"name": "discord", "type": "app", "app": "discord"},
            {"name": "channels", "type": "$.discord.channel[]"},
        ],
    }
    schema = normalize_configurable_props(component, action_id="discord-new-message")
    configured = build_configured_props(
        schema,
        auth_provision_id="apn_test",
        static_config={"channels": "1541166631848386756"},
    )
    assert configured["channels"] == ["1541166631848386756"]
    assert configured["discord"] == {"authProvisionId": "apn_test"}


def test_a_scalar_destination_stays_scalar_through_the_builder():
    component = {
        "key": "airtable_oauth-create-single-record",
        "app": {"name_slug": "airtable_oauth"},
        "configurable_props": [
            {"name": "airtable", "type": "app", "app": "airtable_oauth"},
            {"name": "baseId", "type": "string", "remoteOptions": True},
        ],
    }
    schema = normalize_configurable_props(component, action_id="airtable_oauth-create")
    configured = build_configured_props(
        schema, auth_provision_id="apn_test", static_config={"baseId": "appX"}
    )
    assert configured["baseId"] == "appX"
