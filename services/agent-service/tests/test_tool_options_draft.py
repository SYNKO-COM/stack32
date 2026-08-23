"""A dependent picker needs the choice made a moment ago, not the saved one.

Pipedream cannot list a board's lists without knowing the board, and the board
is chosen in the drawer seconds before. Reading only the saved config left every
dependent field — list after board, table after base, worksheet after
spreadsheet — as an empty text box asking for an id by hand.
"""

from __future__ import annotations

import json

import pytest
from fastapi import Query


def merge_draft(saved: dict, draft: str | None) -> dict:
    """Mirrors the merge the options endpoint performs."""
    if not draft:
        return dict(saved)
    try:
        pending = json.loads(draft)
    except ValueError:
        return dict(saved)
    if not isinstance(pending, dict):
        return dict(saved)
    merged = dict(saved)
    merged.update({k: v for k, v in pending.items() if v not in (None, "")})
    return merged


def test_a_fresh_choice_reaches_the_catalogue():
    assert merge_draft({}, json.dumps({"board": "b1"}))["board"] == "b1"


def test_a_fresh_choice_wins_over_the_saved_one():
    merged = merge_draft({"board": "old"}, json.dumps({"board": "new"}))
    assert merged["board"] == "new"


def test_saved_values_survive_a_partial_draft():
    merged = merge_draft({"board": "b1", "idList": "l1"}, json.dumps({"board": "b2"}))
    assert merged == {"board": "b2", "idList": "l1"}


def test_blank_choices_never_erase_a_saved_one():
    merged = merge_draft({"board": "b1"}, json.dumps({"board": "", "idList": None}))
    assert merged["board"] == "b1"
    assert "idList" not in merged


def test_malformed_input_is_ignored_not_fatal():
    assert merge_draft({"board": "b1"}, "not json") == {"board": "b1"}
    assert merge_draft({"board": "b1"}, json.dumps(["nope"])) == {"board": "b1"}


def test_no_draft_leaves_the_saved_config_alone():
    assert merge_draft({"board": "b1"}, None) == {"board": "b1"}


@pytest.mark.asyncio
async def test_the_endpoint_accepts_a_draft_parameter():
    """Guards the signature: the drawer sends `draft`, the route must take it."""
    from agent_service.routers.integrations import tool_dynamic_options

    params = tool_dynamic_options.__defaults__ or ()
    assert any(isinstance(p, type(Query(default=None))) for p in params)
    assert "draft" in tool_dynamic_options.__code__.co_varnames
