"""An agent arrives with the actions it needs, not a catalogue of an app.

A "when a card moves, add an Airtable row and post to Slack" agent was built
with eight Airtable actions — including delete-record — eight Trello ones and
nine Slack ones. Twenty-five actions meant a setup card that added up all their
required settings, a drawer that could not agree with it, and a delete action
one hallucinated argument away from the user's data.

Three per app covers read, write and update. Anything else, the agent says so
and the person adds it in Build.
"""

from types import SimpleNamespace

from agent_service.builder.capabilities import (
    DEFAULT_PIPEDREAM_MAX_ACTIONS,
    MAPS_PIPEDREAM_MAX_ACTIONS,
    drop_unrequested_destructive_actions,
)


def _tool(tool_id: str, name: str = ""):
    return SimpleNamespace(tool_id=tool_id, name=name or tool_id, provider="pipedream")


class TestTheCapIsSmallEnoughToRead:
    def test_three_actions_per_app(self):
        assert DEFAULT_PIPEDREAM_MAX_ACTIONS == 3

    def test_maps_gets_a_little_more_for_search_plus_details(self):
        assert MAPS_PIPEDREAM_MAX_ACTIONS == 4
        assert MAPS_PIPEDREAM_MAX_ACTIONS > DEFAULT_PIPEDREAM_MAX_ACTIONS

    def test_it_is_well_under_what_the_live_agent_received(self):
        assert DEFAULT_PIPEDREAM_MAX_ACTIONS < 8


class TestDestructiveActionsStayOut:
    AIRTABLE = [
        _tool("pd:airtable_oauth-create-single-record"),
        _tool("pd:airtable_oauth-update-record"),
        _tool("pd:airtable_oauth-delete-record"),
        _tool("pd:airtable_oauth-search-records"),
    ]

    def test_delete_is_dropped_from_an_add_a_row_mission(self):
        kept = drop_unrequested_destructive_actions(
            self.AIRTABLE, "ajoute une ligne dans ma base airtable"
        )
        assert [t.tool_id for t in kept] == [
            "pd:airtable_oauth-create-single-record",
            "pd:airtable_oauth-update-record",
            "pd:airtable_oauth-search-records",
        ]

    def test_remove_and_archive_go_too(self):
        tools = [
            _tool("pd:trello-create-card"),
            _tool("pd:trello-remove-label-from-card"),
            _tool("pd:trello-archive-card"),
        ]
        kept = drop_unrequested_destructive_actions(tools, "crée une carte trello")
        assert [t.tool_id for t in kept] == ["pd:trello-create-card"]

    def test_a_mission_that_asks_to_delete_keeps_them(self):
        kept = drop_unrequested_destructive_actions(
            self.AIRTABLE, "supprime les lignes obsoletes de ma base airtable"
        )
        assert len(kept) == 4

    def test_english_phrasing_asks_just_as_well(self):
        kept = drop_unrequested_destructive_actions(
            self.AIRTABLE, "delete stale rows from my airtable base"
        )
        assert len(kept) == 4

    def test_archiving_counts_as_asking(self):
        kept = drop_unrequested_destructive_actions(
            self.AIRTABLE, "archive les anciennes fiches"
        )
        assert len(kept) == 4


class TestItNeverLeavesTheAgentEmptyHanded:
    def test_an_app_whose_every_action_destroys_keeps_them(self):
        tools = [_tool("pd:some_app-delete-thing"), _tool("pd:some_app-remove-thing")]
        kept = drop_unrequested_destructive_actions(tools, "range mon espace")
        assert len(kept) == 2

    def test_nothing_in_nothing_out(self):
        assert drop_unrequested_destructive_actions([], "peu importe") == []


class TestItReadsTheVerbNotTheNoun:
    def test_an_action_merely_containing_a_verb_is_kept(self):
        # `update-removed-items` updates; it does not remove.
        tools = [_tool("pd:app-update-removed-items")]
        kept = drop_unrequested_destructive_actions(tools, "mets a jour")
        assert len(kept) == 1

    def test_the_app_slug_is_not_mistaken_for_a_verb(self):
        tools = [_tool("pd:deleteme_app-create-record")]
        kept = drop_unrequested_destructive_actions(tools, "cree une fiche")
        assert len(kept) == 1
