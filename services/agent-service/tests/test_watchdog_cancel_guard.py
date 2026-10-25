"""An automatic cancel must not kill a build that was just unblocked.

The browser cancels a build that stops producing activity, so a worker that
exits early cannot leave a spinner turning forever. Its clock ran from the last
thread message — minutes old whenever the user has just answered a tool-review
form — so answering one cancelled the very run it had unblocked, and the build
died with "Arrêté" one second after resuming. Twice, live.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from agent_service.routers.runs import (
    WATCHDOG_SILENCE_SECONDS,
    _run_is_silent_enough_to_cancel,
)


def ago(seconds: float) -> str:
    return (datetime.now(UTC) - timedelta(seconds=seconds)).isoformat()


class FakeDb:
    def __init__(self, events: list[dict] | None = None, raises: bool = False):
        self._events = events or []
        self._raises = raises

    async def list_run_events(self, run_id: str, user_id: str):
        if self._raises:
            raise RuntimeError("persistence down")
        return self._events


@pytest.mark.asyncio
async def test_a_run_that_just_resumed_is_protected():
    row = {"id": "r1", "started_at": ago(2), "created_at": ago(900)}
    assert await _run_is_silent_enough_to_cancel(FakeDb(), row, "u1") is False


@pytest.mark.asyncio
async def test_a_run_with_recent_activity_is_protected():
    row = {"id": "r1", "started_at": ago(900), "created_at": ago(900)}
    db = FakeDb([{"created_at": ago(5)}])
    assert await _run_is_silent_enough_to_cancel(db, row, "u1") is False


@pytest.mark.asyncio
async def test_a_genuinely_silent_run_is_still_cancelled():
    old = WATCHDOG_SILENCE_SECONDS + 60
    row = {"id": "r1", "started_at": ago(old), "created_at": ago(old)}
    db = FakeDb([{"created_at": ago(old)}])
    assert await _run_is_silent_enough_to_cancel(db, row, "u1") is True


@pytest.mark.asyncio
async def test_the_newest_signal_decides():
    """One fresh event outweighs an old start time."""
    old = WATCHDOG_SILENCE_SECONDS + 60
    row = {"id": "r1", "started_at": ago(old), "created_at": ago(old)}
    db = FakeDb([{"created_at": ago(old)}, {"created_at": ago(3)}])
    assert await _run_is_silent_enough_to_cancel(db, row, "u1") is False


@pytest.mark.asyncio
async def test_unreadable_events_fall_back_to_the_run_timestamps():
    row = {"id": "r1", "started_at": ago(2), "created_at": ago(2)}
    assert await _run_is_silent_enough_to_cancel(FakeDb(raises=True), row, "u1") is False


@pytest.mark.asyncio
async def test_a_run_with_no_timestamps_at_all_stays_cancellable():
    """Never strand a run we cannot reason about."""
    assert await _run_is_silent_enough_to_cancel(FakeDb(), {"id": "r1"}, "u1") is True


@pytest.mark.asyncio
async def test_a_malformed_timestamp_is_ignored_not_trusted():
    row = {"id": "r1", "started_at": "not-a-date", "created_at": ago(2)}
    assert await _run_is_silent_enough_to_cancel(FakeDb(), row, "u1") is False


def test_canceling_chat_does_not_change_agent_readiness():
    from agent_service.builder.conversation import status_after_builder_cancel

    assert status_after_builder_cancel({"input": {"mode": "chat"}}, {"status": "needs_attention", "first_ready_celebrated": True}) is None


def test_canceling_build_restores_its_actual_previous_status():
    from agent_service.builder.conversation import status_after_builder_cancel

    assert status_after_builder_cancel({"input": {"mode": "build", "agent_status_before": "needs_attention"}}, {"status": "building", "first_ready_celebrated": True}) == "needs_attention"
    assert status_after_builder_cancel({"input": {}}, {"status": "published"}) == "published"
