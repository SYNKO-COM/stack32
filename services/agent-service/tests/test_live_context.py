"""Unit tests for Live conversation context helpers."""

from __future__ import annotations

from agent_service.runtime.context import (
    append_rolling_summary,
    has_prior_conversation_context,
    strip_current_user_turn,
)


def test_strip_current_user_turn_removes_trailing_users():
    msgs = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
        {"role": "user", "content": "follow up"},
    ]
    assert strip_current_user_turn(msgs) == [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
    ]


def test_strip_current_user_turn_first_message_empty():
    assert strip_current_user_turn([{"role": "user", "content": "first"}]) == []


def test_has_prior_from_second_message():
    assert not has_prior_conversation_context(history=[], conversation_summary=None)
    assert not has_prior_conversation_context(history=[], conversation_summary="")
    assert has_prior_conversation_context(
        history=[{"role": "user", "content": "hi"}, {"role": "assistant", "content": "yo"}]
    )
    assert has_prior_conversation_context(
        history=[], conversation_summary="User: hi\nAssistant: yo"
    )


def test_append_rolling_summary_grows_and_caps():
    first = append_rolling_summary(None, user_text="a", assistant_text="b")
    assert "User: a" in first and "Assistant: b" in first
    second = append_rolling_summary(first, user_text="c", assistant_text="d")
    assert "User: a" in second and "User: c" in second
    huge_prev = "x" * 3900
    capped = append_rolling_summary(huge_prev, user_text="n", assistant_text="m", max_chars=4000)
    assert len(capped) <= 4000
    assert capped.endswith("Assistant: m") or "Assistant: m" in capped
