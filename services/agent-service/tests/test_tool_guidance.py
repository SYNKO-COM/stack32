"""A failure should tell the agent what to do next, not only what broke.

Told just `Unknown field name: "Auteur"`, the agent invented a catch-all column
and poured the whole ticket into it instead of mapping onto the columns already
there. Guidance is keyed on the shape of the error, never on the app, so one
rule covers the whole catalogue.
"""

from __future__ import annotations

import pytest

from agent_service.runtime.tool_guidance import guidance_for_tool_error, with_guidance


def test_the_airtable_failure_that_started_this():
    advice = guidance_for_tool_error(
        "PIPEDREAM_ACTION_FAILED", 'UNKNOWN_FIELD_NAME - 422 - Unknown field name: "Auteur"'
    )
    assert advice is not None
    assert "existing fields" in advice
    assert "never create one" in advice


@pytest.mark.parametrize(
    "message",
    [
        'Unknown field name: "Auteur"',
        "No such column: priority",
        "Invalid field 'summary'",
        "Unrecognized property assignee",
        "field 'status' does not exist",
    ],
)
def test_every_shape_of_a_missing_field_is_recognised(message):
    assert "map your values" in (guidance_for_tool_error(None, message) or "")


def test_a_permission_error_says_stop_retrying():
    advice = guidance_for_tool_error("403", "Forbidden: insufficient scope") or ""
    assert "Do not retry" in advice


def test_a_rate_limit_says_come_back_later():
    advice = guidance_for_tool_error(None, "429 Too Many Requests") or ""
    assert "rate limiting" in advice


def test_an_expired_connection_says_reconnect():
    advice = guidance_for_tool_error("401", "token expired") or ""
    assert "reconnecting" in advice


def test_a_missing_id_says_look_it_up():
    advice = guidance_for_tool_error(None, "404 not_found") or ""
    assert "Look the record up" in advice


def test_an_unknown_failure_offers_nothing_rather_than_noise():
    assert guidance_for_tool_error("WEIRD", "something inexplicable happened") is None
    assert guidance_for_tool_error(None, None) is None


def test_guidance_rides_along_without_disturbing_the_observation():
    obs = {"error": "PIPEDREAM_ACTION_FAILED", "message": 'Unknown field name: "X"'}
    out = with_guidance(obs, obs["error"], obs["message"])
    assert out["error"] == obs["error"]
    assert out["message"] == obs["message"]
    assert "guidance" in out
    assert obs == {"error": "PIPEDREAM_ACTION_FAILED", "message": 'Unknown field name: "X"'}


def test_existing_guidance_is_never_overwritten():
    obs = {"error": "x", "guidance": "already said"}
    assert with_guidance(obs, "404", "not found")["guidance"] == "already said"


def test_a_clean_observation_is_returned_unchanged():
    obs = {"ok": True}
    assert with_guidance(obs, None, None) is obs
