"""Adding a capability must never cost the agent one it already had.

A modify round rebuilds the tool set from what the builder proposed that
round, so anything not re-proposed vanished. Asking this agent for a draft
tool cost it the email search bound five minutes earlier, and it said so
itself: "l'action Find Emails n'est pas disponible".
"""

from __future__ import annotations

from agent_service.builder.tool_review import carry_over_existing_tools
from agent_service.models.agent_spec import ToolBinding


def tool(tool_id: str, app_id: str | None = None) -> ToolBinding:
    return ToolBinding(
        tool_id=tool_id,
        provider="pipedream" if tool_id.startswith("pd:") else "native",
        app_id=app_id,
        enabled=True,
    )


FIND = tool("pd:gmail-find-email", "gmail")
DRAFT = tool("pd:gmail-create-draft", "gmail")
SLACK = tool("pd:slack-send-message", "slack")


def ids(tools):
    return {t.tool_id for t in tools}


def test_adding_a_draft_tool_keeps_the_search_tool():
    kept = carry_over_existing_tools(
        current=[FIND],
        new_tools=[DRAFT],
        offered=[DRAFT],
        confirmed_apps={"gmail"},
    )
    assert ids(kept) == {"pd:gmail-create-draft", "pd:gmail-find-email"}


def test_declining_an_app_still_removes_its_tools():
    """Removal has to keep working, or the review form means nothing."""
    kept = carry_over_existing_tools(
        current=[FIND],
        new_tools=[],
        offered=[FIND],
        confirmed_apps=set(),
    )
    assert ids(kept) == set()


def test_an_untouched_app_is_none_of_this_change_s_business():
    kept = carry_over_existing_tools(
        current=[SLACK],
        new_tools=[DRAFT],
        offered=[DRAFT],
        confirmed_apps={"gmail"},
    )
    assert "pd:slack-send-message" in ids(kept)


def test_no_duplicates_when_a_tool_is_re_proposed():
    kept = carry_over_existing_tools(
        current=[FIND, DRAFT],
        new_tools=[DRAFT],
        offered=[DRAFT],
        confirmed_apps={"gmail"},
    )
    assert len(kept) == len(ids(kept)) == 2


def test_new_tools_keep_their_order_first():
    kept = carry_over_existing_tools(
        current=[FIND],
        new_tools=[DRAFT],
        offered=[DRAFT],
        confirmed_apps={"gmail"},
    )
    assert kept[0].tool_id == "pd:gmail-create-draft"


def test_empty_current_spec_changes_nothing():
    kept = carry_over_existing_tools(
        current=[], new_tools=[DRAFT], offered=[DRAFT], confirmed_apps={"gmail"}
    )
    assert ids(kept) == {"pd:gmail-create-draft"}


def test_disabled_tools_are_not_resurrected():
    disabled = FIND.model_copy(update={"enabled": False})
    kept = carry_over_existing_tools(
        current=[disabled],
        new_tools=[DRAFT],
        offered=[DRAFT],
        confirmed_apps={"gmail"},
    )
    assert ids(kept) == {"pd:gmail-create-draft"}
