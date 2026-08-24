"""What an action acts on is chosen per call, not pinned in a settings drawer.

The readiness card on a freshly built agent asked the user to "Configure
pd:airtable_oauth-update-record: baseId, tableId, recordId". The base and the
table are settings — you pick them once. The *record* to update is the subject
of the action: the agent decides it every time it runs. Pipedream marks all
three required and exposes all three as `remoteOptions` pickers, so only the
action's own key tells them apart.

The same card also demanded a value for `warningAlert`, which is a coloured
notice Pipedream renders in its own form — not a field at all.
"""

import pytest

from agent_service.integrations.pipedream.schema import (
    action_subject,
    is_display_only,
    normalize_configurable_props,
)


def _schema(key: str, props: list[dict]):
    return normalize_configurable_props({"key": key, "configurable_props": props})


def _kinds(schema) -> dict[str, str]:
    return {p.name: p.kind for p in schema.props}


class TestReadingTheSubjectOutOfTheKey:
    @pytest.mark.parametrize(
        ("key", "expected"),
        [
            ("airtable_oauth-update-record", "record"),
            ("trello-update-card", "card"),
            ("slack_v2-send-message", "message"),
            ("_1crm-update-lead", "lead"),
            ("google_sheets-add-single-row", "row"),
            ("algodocs-upload-file", "file"),
        ],
    )
    def test_the_noun_after_the_verb(self, key, expected):
        assert action_subject(key) == expected

    def test_an_app_slug_carrying_a_dash_does_not_confuse_it(self):
        # `_1crm` and `google_sheets` are one segment, but some slugs are not.
        assert action_subject("zoho-crm-update-contact") == "contact"

    def test_a_key_with_no_verb_names_no_subject(self):
        assert action_subject("some_app-webhook") is None
        assert action_subject("") is None


class TestTheRealAirtableUpdateRecord:
    """The exact contract Pipedream publishes for the action in the report."""

    PROPS = [
        {"name": "airtable", "type": "app"},
        {"name": "baseId", "type": "string", "remoteOptions": True},
        {"name": "warningAlert", "type": "alert"},
        {"name": "tableId", "type": "string", "remoteOptions": True},
        {"name": "recordId", "type": "string", "remoteOptions": True},
        {"name": "returnFieldsByFieldId", "type": "boolean", "optional": True},
    ]

    def test_the_base_and_table_stay_settings(self):
        kinds = _kinds(_schema("airtable_oauth-update-record", self.PROPS))
        assert kinds["baseId"] == "static"
        assert kinds["tableId"] == "static"

    def test_the_record_is_the_agents_to_choose(self):
        kinds = _kinds(_schema("airtable_oauth-update-record", self.PROPS))
        assert kinds["recordId"] == "runtime"

    def test_the_warning_box_is_not_a_field_at_all(self):
        kinds = _kinds(_schema("airtable_oauth-update-record", self.PROPS))
        assert "warningAlert" not in kinds

    def test_readiness_now_asks_for_two_settings_not_three(self):
        schema = _schema("airtable_oauth-update-record", self.PROPS)
        required_settings = [p.name for p in schema.props_of("static") if p.required]
        assert required_settings == ["baseId", "tableId"]

    def test_the_agent_can_still_supply_the_record(self):
        schema = _schema("airtable_oauth-update-record", self.PROPS)
        params = schema.llm_json_schema()
        assert "recordId" in params["properties"]
        assert "recordId" in params["required"]


class TestTheRuleHoldsAcrossApps:
    def test_updating_a_table_makes_the_table_the_subject(self):
        # In update-table the table is what changes, so it is not a setting.
        kinds = _kinds(
            _schema(
                "airtable_oauth-update-table",
                [
                    {"name": "baseId", "type": "string", "remoteOptions": True},
                    {"name": "tableId", "type": "string", "remoteOptions": True},
                ],
            )
        )
        assert kinds["baseId"] == "static"
        assert kinds["tableId"] == "runtime"

    def test_creating_a_record_leaves_the_table_a_setting(self):
        # Nothing named `record` is picked here, so table stays configurable.
        kinds = _kinds(
            _schema(
                "airtable_oauth-create-single-record",
                [
                    {"name": "baseId", "type": "string", "remoteOptions": True},
                    {"name": "tableId", "type": "string", "remoteOptions": True},
                ],
            )
        )
        assert kinds["baseId"] == "static"
        assert kinds["tableId"] == "static"

    def test_a_trello_card_is_the_agents_to_choose(self):
        kinds = _kinds(
            _schema(
                "trello-update-card",
                [
                    {"name": "boardId", "type": "string", "remoteOptions": True},
                    {"name": "cardId", "type": "string", "remoteOptions": True},
                ],
            )
        )
        assert kinds["boardId"] == "static"
        assert kinds["cardId"] == "runtime"

    def test_a_slack_channel_stays_a_setting_when_sending_a_message(self):
        kinds = _kinds(
            _schema(
                "slack_v2-send-message-to-channel",
                [
                    {"name": "conversation", "type": "string", "remoteOptions": True},
                    {"name": "text", "type": "string"},
                ],
            )
        )
        assert kinds["conversation"] == "static"


class TestDisplayOnlyTypes:
    def test_an_alert_is_a_notice(self):
        assert is_display_only("alert") is True
        assert is_display_only("ALERT") is True

    def test_a_real_field_is_not(self):
        for t in ("string", "boolean", "string[]", "$.airtable.baseId"):
            assert is_display_only(t) is False


class TestTheObjectIsOftenMoreThanOneWord:
    """The subject used to be the single token after the verb.

    That read `update-blog-post-draft` as acting on a "blog", so `blogPostId`
    did not match and the readiness gate asked the user to pin which blog post
    the agent would edit before it could publish. Same for
    `reply-to-side-conversation` and its `sideConversationId`. Six actions on a
    live agent were blocked this way, none of them fillable by a person.
    """

    def test_it_reads_the_whole_object_phrase(self):
        from agent_service.integrations.pipedream.schema import action_object_tokens

        assert action_object_tokens("hubspot-update-blog-post-draft") == (
            "blog",
            "post",
            "draft",
        )

    def test_a_connector_right_after_the_verb_introduces_the_object(self):
        from agent_service.integrations.pipedream.schema import action_object_tokens

        assert action_object_tokens("zendesk-reply-to-side-conversation") == (
            "side",
            "conversation",
        )

    def test_a_later_connector_ends_the_object_and_names_the_container(self):
        # `send-message-to-channel` acts on the message; the channel is where it
        # goes, which is a setting a person pins once. Swallowing the whole tail
        # made the channel per-call and Slack lost its configuration.
        from agent_service.integrations.pipedream.schema import action_object_tokens

        assert action_object_tokens("slack_v2-send-message-to-channel") == ("message",)

    def test_a_prop_matching_any_run_of_the_phrase_is_per_call(self):
        from agent_service.integrations.pipedream.schema import (
            _is_action_subject,
            action_object_tokens,
        )

        tokens = action_object_tokens("hubspot-update-blog-post-draft")
        assert _is_action_subject("blogPostId", tokens)
        # The blog that contains the post is not the post.
        assert not _is_action_subject("contentGroupId", tokens)

    def test_a_bare_id_is_always_the_thing_acted_on(self):
        from agent_service.integrations.pipedream.schema import (
            _is_action_subject,
            action_object_tokens,
        )

        # Stripe calls the invoice `id`, so stripping the tail leaves nothing to
        # compare and the old rule filed it as a setting to pin.
        for key in ("stripe-send-invoice", "stripe-finalize-invoice"):
            assert _is_action_subject("id", action_object_tokens(key)), key

    def test_the_containers_of_a_record_stay_settings(self):
        from agent_service.integrations.pipedream.schema import (
            _is_action_subject,
            action_object_tokens,
        )

        tokens = action_object_tokens("airtable_oauth-update-record")
        assert _is_action_subject("recordId", tokens)
        for container in ("baseId", "tableId"):
            assert not _is_action_subject(container, tokens), container

    def test_a_padding_word_does_not_become_the_object(self):
        from agent_service.integrations.pipedream.schema import action_object_tokens

        # "single" is padding; the row is what gets added.
        assert action_object_tokens("google_sheets-add-single-row") == ("row",)
