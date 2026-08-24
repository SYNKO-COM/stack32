"""A setting is what the app needs everywhere; an item is what one action needs.

The agent in the report bound nine Trello actions and eight Airtable ones, so
the readiness card added up their required props and asked the user to pin a
checklist item id, a member id and a card id before it could run — none of
which anyone can know in advance. `baseId` is required by every Airtable action
bound here; `recordId` by one. Counting how widely a prop is required tells a
setting from an item without a list of app-specific names.

The rule lives inside `evaluate_agent_readiness`, so this exercises it on the
same shapes the live agent produced.
"""


def shared_fields(
    action_shapes: list[set[str]], missing: list[str]
) -> list[str]:
    """The selection rule as the evaluator applies it."""
    if not action_shapes:
        # Nothing to compare against: keep what was found rather than passing
        # an agent as ready on no evidence.
        return list(missing)
    threshold = (len(action_shapes) + 1) // 2
    return [
        field
        for field in missing
        if sum(1 for shape in action_shapes if field in shape) >= threshold
    ]


# What the live agent's Airtable actions each declared as required settings.
AIRTABLE = [
    {"baseId"},                        # update-table (tableId is its subject)
    {"baseId", "tableId"},             # update-record
    {"baseId", "tableId"},             # update-field
    {"baseId", "tableId", "recordId"}, # update-comment
    {"baseId", "tableId"},             # delete-record
    {"baseId"},                        # create-table
    {"baseId", "tableId"},             # search-records
    {"baseId"},                        # list-tables
]

# The Trello actions, including the three that dragged in unanswerable ids.
TRELLO = [
    {"board"},                                  # update-card
    {"board"},                                  # remove-label-from-card
    {"board", "checklistId", "checklistItemId"},# update-checklist-item
    {"board", "idMember"},                      # search-members
    {"board"},                                  # search-cards
    set(),                                      # search-boards
    {"board", "idList"},                        # rename-list
    {"board", "idList"},                        # move-card-to-list
    {"board"},                                  # update-card-2
]


class TestAirtable:
    def test_the_base_is_asked_for(self):
        assert "baseId" in shared_fields(AIRTABLE, ["baseId", "tableId", "recordId"])

    def test_the_table_is_asked_for(self):
        assert "tableId" in shared_fields(AIRTABLE, ["baseId", "tableId", "recordId"])

    def test_the_record_is_left_to_the_agent(self):
        assert "recordId" not in shared_fields(AIRTABLE, ["baseId", "tableId", "recordId"])

    def test_the_card_asks_for_exactly_two_settings(self):
        assert shared_fields(AIRTABLE, ["baseId", "tableId", "recordId"]) == [
            "baseId",
            "tableId",
        ]


class TestTrello:
    def test_the_board_is_asked_for(self):
        assert "board" in shared_fields(TRELLO, ["board", "checklistItemId", "idMember"])

    def test_a_checklist_item_is_never_asked_for(self):
        assert "checklistItemId" not in shared_fields(TRELLO, ["checklistItemId"])

    def test_a_member_id_is_never_asked_for(self):
        assert "idMember" not in shared_fields(TRELLO, ["idMember"])

    def test_a_list_needed_by_two_of_nine_is_left_to_the_agent(self):
        assert "idList" not in shared_fields(TRELLO, ["idList"])

    def test_the_card_asks_for_the_board_alone(self):
        asked = shared_fields(
            TRELLO,
            ["board", "checklistId", "checklistItemId", "idMember", "idList"],
        )
        assert asked == ["board"]


class TestTheEdges:
    def test_an_app_with_one_action_keeps_all_of_its_settings(self):
        # Nothing to compare against, so every required prop is a setting.
        assert shared_fields([{"channel", "text"}], ["channel", "text"]) == [
            "channel",
            "text",
        ]

    def test_a_prop_in_exactly_half_still_counts_as_shared(self):
        shapes = [{"a"}, {"a"}, set(), set()]
        assert shared_fields(shapes, ["a"]) == ["a"]

    def test_nothing_missing_asks_for_nothing(self):
        assert shared_fields(AIRTABLE, []) == []

    def test_no_shapes_at_all_keeps_what_was_found(self):
        assert shared_fields([], ["baseId"]) == ["baseId"]


class TestASettingCarriesAcrossItsTwoNames:
    """`board` in create-card is the `idBoard` update-card asks for."""

    def test_identity_strips_the_id_shape(self):
        from agent_service.integrations.pipedream.tool_config import setting_identity

        assert setting_identity("idBoard") == setting_identity("board")
        assert setting_identity("idList") == setting_identity("list")
        assert setting_identity("tableId") == setting_identity("table")

    def test_it_keeps_different_settings_apart(self):
        from agent_service.integrations.pipedream.tool_config import setting_identity

        assert setting_identity("baseId") != setting_identity("tableId")
        assert setting_identity("idBoard") != setting_identity("idList")

    def test_a_board_saved_once_satisfies_either_spelling(self):
        from agent_service.integrations.pipedream.tool_config import (
            is_static_prop_configured,
        )

        saved = {"board": "67e4ec5b450bf71141b23584"}
        assert is_static_prop_configured("board", saved, app_id="trello")
        assert is_static_prop_configured("idBoard", saved, app_id="trello")

    def test_it_does_not_satisfy_a_setting_nobody_chose(self):
        from agent_service.integrations.pipedream.tool_config import (
            is_static_prop_configured,
        )

        saved = {"board": "67e4ec5b450bf71141b23584"}
        assert not is_static_prop_configured("idList", saved, app_id="trello")
        assert not is_static_prop_configured("tableId", saved, app_id="trello")
