"""The sentence already says which app starts the agent — read it.

A live build from "Quand une carte arrive dans la liste Termine de mon tableau
Trello, ajoute une ligne dans ma base Airtable avec le nom de la carte et la
date, puis poste un message de felicitations dans Slack." left the trigger form
empty: the user had to tick "Événement d'un outil" and type "Trello" by hand,
having just written it.
"""

from agent_service.builder.capabilities import suggest_tool_trigger_app


class TestTheAppThatStartsTheAgent:
    def test_reads_the_source_app_out_of_the_opening_clause(self):
        prompt = (
            "Quand une carte arrive dans la liste Termine de mon tableau Trello, "
            "ajoute une ligne dans ma base Airtable avec le nom de la carte et la "
            "date, puis poste un message de felicitations dans Slack."
        )
        assert suggest_tool_trigger_app(prompt) == "trello"

    def test_the_targets_after_the_comma_are_not_the_source(self):
        # Airtable and Slack are where the work lands, not what starts it.
        prompt = (
            "Dès qu'un message arrive sur Discord, crée une ligne Airtable "
            "et préviens Slack."
        )
        assert suggest_tool_trigger_app(prompt) == "discord"

    def test_reads_english_the_same_way(self):
        prompt = "When a card lands in my Trello board, add a row to Airtable."
        assert suggest_tool_trigger_app(prompt) == "trello"

    def test_handles_every_time_and_as_soon_as(self):
        assert (
            suggest_tool_trigger_app("Each time a Notion page changes, ping Slack.")
            == "notion"
        )
        assert (
            suggest_tool_trigger_app("As soon as a Stripe payment lands, log it.")
            == "stripe"
        )


class TestWhenItShouldStaySilent:
    def test_a_clock_is_a_schedule_and_not_a_tool_event(self):
        prompt = (
            "Chaque lundi matin, résume les nouvelles lignes de ma base Airtable "
            "dans Slack."
        )
        assert suggest_tool_trigger_app(prompt) is None

    def test_a_plain_instruction_names_no_trigger(self):
        prompt = "Recherche des entreprises, note les prospects et rédige un email."
        assert suggest_tool_trigger_app(prompt) is None

    def test_an_event_opener_with_no_app_names_nothing(self):
        prompt = "Quand j'ai une nouvelle idée, garde-la de côté."
        assert suggest_tool_trigger_app(prompt) is None

    def test_empty_input_is_not_a_trigger(self):
        assert suggest_tool_trigger_app("") is None
        assert suggest_tool_trigger_app("   ") is None

    def test_a_clock_inside_the_event_clause_still_wins(self):
        # "Chaque jour" is the start condition here even though Slack appears.
        prompt = "Chaque jour à 9h, poste le résumé dans Slack."
        assert suggest_tool_trigger_app(prompt) is None


class TestTheEarliestOpenerWins:
    def test_picks_the_first_event_clause_not_a_later_one(self):
        prompt = (
            "Quand une carte bouge dans Trello, note-la ; "
            "et quand un mail arrive dans Gmail, ignore-le."
        )
        assert suggest_tool_trigger_app(prompt) == "trello"


class TestOnlyCatalogueSlugsAreOffered:
    def test_an_unknown_long_tail_name_is_not_offered(self):
        # extract_external_app_queries also returns free-text search queries for
        # apps outside the alias table. Filling the picker with one of those
        # would point the event lookup at an app id that does not exist.
        prompt = "Quand une entrée arrive dans Zblorgtastic Suite, préviens Slack."
        assert suggest_tool_trigger_app(prompt) is None

    def test_a_known_alias_resolves_to_its_canonical_slug(self):
        prompt = "Quand un message arrive sur Discord, note-le."
        suggested = suggest_tool_trigger_app(prompt)
        assert suggested == "discord"
        assert suggested == suggested.lower()
        assert " " not in suggested
