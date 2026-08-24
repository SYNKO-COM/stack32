"""A setting stated in Build gets saved, not just read back.

The drawer was the only way to fill a tool's settings: typing "mon email
d'expéditeur est support@acme.com" in Build rebuilt the spec and left the
drawer empty, and the agent stayed behind "à configurer" over a value the
person had just given.
"""

from agent_service.builder.config_from_chat import (
    AppliedFromChat,
    ChatSetting,
    _parse_extraction,
    compose_settings_reply,
    match_option,
)


def _setting(**kw) -> ChatSetting:
    base = dict(
        tool_id="pd:sendgrid-send-email-single-recipient",
        app_id="sendgrid",
        name="fromEmail",
        label="From Email",
        description="",
        required=True,
        missing=True,
        has_options=False,
    )
    base.update(kw)
    return ChatSetting(**base)


class TestReadingTheModelsAnswer:
    def test_a_plain_answer_parses(self):
        got, more = _parse_extraction(
            '{"assignments": [{"index": 0, "value": "support@acme.com"}], '
            '"wants_other_changes": false}'
        )
        assert got == [(0, "support@acme.com")]
        assert more is False

    def test_a_fenced_answer_parses_too(self):
        got, _ = _parse_extraction(
            '```json\n{"assignments": [{"index": 1, "value": "Inbox"}], '
            '"wants_other_changes": true}\n```'
        )
        assert got == [(1, "Inbox")]

    def test_garbage_saves_nothing_and_lets_the_build_continue(self):
        got, more = _parse_extraction("The user wants to configure things.")
        assert got == []
        assert more is True

    def test_a_malformed_assignment_is_dropped(self):
        got, _ = _parse_extraction(
            '{"assignments": [{"index": "zero", "value": "x"}, {"value": "y"}, '
            '{"index": 2, "value": "kept"}], "wants_other_changes": false}'
        )
        assert got == [(2, "kept")]


class TestMatchingWhatThePersonSaid:
    OPTIONS = [
        {"label": "Support Inbox", "value": "inb_123"},
        {"label": "Sales Inbox", "value": "inb_456"},
    ]

    def test_a_label_finds_its_id(self):
        assert match_option("Support Inbox", self.OPTIONS) == "inb_123"

    def test_an_id_is_kept_as_itself(self):
        assert match_option("inb_456", self.OPTIONS) == "inb_456"

    def test_a_partial_name_matches_when_it_is_unambiguous(self):
        assert match_option("support", self.OPTIONS) == "inb_123"

    def test_an_ambiguous_partial_matches_nothing(self):
        # "inbox" is in both labels; guessing would bill the wrong one.
        assert match_option("inbox", self.OPTIONS) is None

    def test_nothing_matches_nothing(self):
        assert match_option("marketing", self.OPTIONS) is None
        assert match_option("", self.OPTIONS) is None
        assert match_option("x", []) is None


class TestTheReply:
    def test_it_says_what_was_saved_in_french(self):
        outcome = AppliedFromChat(wants_other_changes=False)
        outcome.saved = [(_setting(), "support@acme.com")]
        text = compose_settings_reply(outcome, "fr")
        assert "enregistré" in text
        assert "Sendgrid" in text

    def test_it_lists_what_still_blocks(self):
        outcome = AppliedFromChat(wants_other_changes=False)
        outcome.saved = [(_setting(), "support@acme.com")]
        outcome.still_missing = [
            _setting(tool_id="pd:hubspot-send-message", app_id="hubspot",
                     name="inboxId", label="Inbox")
        ]
        text = compose_settings_reply(outcome, "fr")
        assert "Inbox" in text and "Hubspot" in text

    def test_ready_is_announced(self):
        outcome = AppliedFromChat(wants_other_changes=False)
        outcome.saved = [(_setting(), "support@acme.com")]
        outcome.ready = True
        assert "prêt" in compose_settings_reply(outcome, "fr")
        assert "ready" in compose_settings_reply(outcome, "en")

    def test_a_near_miss_shows_the_real_choices(self):
        outcome = AppliedFromChat(wants_other_changes=False)
        outcome.unmatched = [(_setting(name="inboxId", label="Inbox",
                                       app_id="hubspot", has_options=True),
                              "Marketing", ["Support Inbox", "Sales Inbox"])]
        text = compose_settings_reply(outcome, "fr")
        assert "Marketing" in text and "Support Inbox" in text

    def test_a_bad_email_shape_is_refused_not_saved(self):
        from agent_service.builder.config_from_chat import _value_shape_ok

        assert not _value_shape_ok(_setting(), "support at acme")
        assert _value_shape_ok(_setting(), "support@acme.com")
        # Non-email fields take any text.
        assert _value_shape_ok(_setting(name="inboxId"), "whatever")
