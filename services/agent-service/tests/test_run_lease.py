"""Cloud Tasks retries must not restart a run that is still executing.

The production queue is configured with maxAttempts=5 while Cloud Run capped
requests at 300s. A coding build that outlived the timeout was killed, retried,
and executed from scratch — up to five full LLM builds charged for one user
request. process_run_by_id only skipped runs already in a terminal state.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from agent_service.config import get_settings
from agent_service.queue.worker import _is_waiting_for_input, _lease_expired


def _run(**over):
    base = {"status": "running", "started_at": datetime.now(UTC).isoformat(), "input": {}}
    base.update(over)
    return base


def test_fresh_run_holds_its_lease():
    assert _lease_expired(_run()) is False


def test_stale_run_releases_its_lease_so_a_retry_can_take_over():
    old = datetime.now(UTC) - timedelta(seconds=get_settings().RUN_LEASE_SECONDS + 60)
    assert _lease_expired(_run(started_at=old.isoformat())) is True


def test_missing_or_unparseable_started_at_never_blocks_forever():
    assert _lease_expired(_run(started_at=None)) is True
    assert _lease_expired(_run(started_at="not-a-date")) is True


def test_naive_timestamps_are_treated_as_utc():
    naive = (datetime.now(UTC) - timedelta(seconds=5)).replace(tzinfo=None)
    assert _lease_expired(_run(started_at=naive.isoformat())) is False


def test_run_parked_on_a_user_question_is_not_a_duplicate():
    """waiting_for_input is stored as running; it must still be resumable."""
    assert _is_waiting_for_input(_run(error_code="BUILDER_INTERRUPTED")) is True
    assert _is_waiting_for_input(_run(input={"interrupt": {"status": "open"}})) is True
    assert _is_waiting_for_input(_run()) is False
    assert _is_waiting_for_input(_run(input={"interrupt": {"status": "resolved"}})) is False


def test_lease_outlives_the_cloud_tasks_dispatch_deadline():
    """The lease must not expire at the exact moment a retry is dispatched.

    Cloud Tasks abandons the request at the dispatch deadline and retries while
    Cloud Run keeps executing. If the lease expired at the same instant, the
    retry would take over a run that is still alive — the duplicate execution
    the lease exists to prevent.
    """
    settings = get_settings()
    assert settings.RUN_LEASE_SECONDS > settings.CLOUD_TASKS_DISPATCH_DEADLINE_SECONDS
    margin = settings.RUN_LEASE_SECONDS - settings.CLOUD_TASKS_DISPATCH_DEADLINE_SECONDS
    assert margin >= 300, f"only {margin}s of margin between deadline and lease"


def test_a_run_still_alive_at_the_dispatch_deadline_is_treated_as_in_flight():
    settings = get_settings()
    at_deadline = datetime.now(UTC) - timedelta(
        seconds=settings.CLOUD_TASKS_DISPATCH_DEADLINE_SECONDS
    )
    assert _lease_expired(_run(started_at=at_deadline.isoformat())) is False
