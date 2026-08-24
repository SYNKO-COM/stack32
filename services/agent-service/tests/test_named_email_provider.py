"""Someone who named SendGrid does not also want Gmail.

The prompt "envoie-la par email avec SendGrid" arrived with both proposed, and
the person had to refuse one — on an account where Google was deliberately out
of scope. The generic word "email" must not outrank a provider the mission
names outright.
"""

from agent_service.builder.capabilities import (
    _email_tool_ids,
    names_its_own_email_provider,
)


class TestAMissionThatNamesItsProvider:
    def test_sendgrid_suppresses_the_generic_email_tools(self):
        prompt = "quand un ticket arrive dans zendesk, envoie la reponse par email avec sendgrid"
        assert names_its_own_email_provider(prompt)
        assert _email_tool_ids(prompt) == []

    def test_other_providers_count_too(self):
        for name in ("mailgun", "postmark", "brevo", "resend", "mailchimp"):
            assert names_its_own_email_provider(f"envoie un email avec {name}"), name

    def test_a_two_word_name_is_recognised(self):
        assert names_its_own_email_provider("envoie via amazon ses")

    def test_it_is_case_insensitive(self):
        assert names_its_own_email_provider("Envoie avec SendGrid")


class TestAMissionThatDoesNot:
    def test_a_generic_email_prompt_still_gets_email_tools(self):
        prompt = "traite mes emails entrants et reponds-y"
        assert not names_its_own_email_provider(prompt)
        assert _email_tool_ids(prompt)

    def test_a_mission_about_something_else_entirely(self):
        assert not names_its_own_email_provider("cree une carte trello")

    def test_empty_input_names_nothing(self):
        assert not names_its_own_email_provider("")
