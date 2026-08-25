"""A run Cloud Tasks never delivered must fail loudly, not spin.

On 2026-08-25 the OIDC audience was pinned to the API's tick URL while run
tasks were sent to the worker: every delivery answered 401, the task retried
until it expired, and the run sat in "queued" with the Build view spinning.
Enqueue had succeeded, so nothing anywhere considered it a failure.

The schedule tick now sweeps runs that stayed queued long past any plausible
delivery and fails them with a code the UI explains.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from agent_service.queue.sweeper import (
    UNDELIVERED_CODE,
    sweep_undelivered_runs,
)


class _Response:
    def __init__(self, rows):
        self._rows = rows

    def json(self):
        return self._rows


class _Client:
    def __init__(self, rows, raises: Exception | None = None):
        self._rows = rows
        self._raises = raises
        self.params: dict | None = None

    async def get(self, _path, params=None):
        self.params = params
        if self._raises:
            raise self._raises
        return _Response(self._rows)


class _Db:
    def __init__(self, fail_on: set[str] | None = None):
        self.failed: list[tuple[str, str]] = []
        self.events: list[tuple[str, str]] = []
        self._fail_on = fail_on or set()

    async def emit_event(self, run_id, event_type, _payload):
        self.events.append((run_id, event_type))

    async def fail_run(self, run_id, code):
        if run_id in self._fail_on:
            raise RuntimeError("patch failed")
        self.failed.append((run_id, code))


def _row(run_id: str, minutes_ago: int) -> dict:
    when = datetime.now(UTC) - timedelta(minutes=minutes_ago)
    return {"id": run_id, "user_id": "u1", "agent_id": "a1", "created_at": when.isoformat()}


class TestItRescuesTheStuckRun:
    @pytest.mark.asyncio
    async def test_a_long_queued_run_is_failed_with_a_readable_code(self):
        db, client = _Db(), _Client([_row("r1", 30)])
        report = await sweep_undelivered_runs(db=db, client=client)
        assert report["swept"] == 1
        assert db.failed == [("r1", UNDELIVERED_CODE)]

    @pytest.mark.asyncio
    async def test_it_emits_an_event_so_the_view_stops_spinning(self):
        db, client = _Db(), _Client([_row("r1", 30)])
        await sweep_undelivered_runs(db=db, client=client)
        assert db.events == [("r1", "run.failed")]

    @pytest.mark.asyncio
    async def test_it_only_asks_for_queued_runs_older_than_the_cutoff(self):
        db, client = _Db(), _Client([])
        await sweep_undelivered_runs(db=db, client=client, stuck_after_seconds=600)
        assert client.params["status"] == "eq.queued"
        assert client.params["created_at"].startswith("lt.")


class TestItNeverHurtsAHealthyRun:
    @pytest.mark.asyncio
    async def test_nothing_queued_means_nothing_touched(self):
        db, client = _Db(), _Client([])
        report = await sweep_undelivered_runs(db=db, client=client)
        assert report["swept"] == 0
        assert db.failed == []

    @pytest.mark.asyncio
    async def test_a_query_failure_is_swallowed_so_the_tick_survives(self):
        db, client = _Db(), _Client([], raises=RuntimeError("postgrest down"))
        report = await sweep_undelivered_runs(db=db, client=client)
        assert report == {"swept": 0, "error": "query_failed"}

    @pytest.mark.asyncio
    async def test_one_bad_row_does_not_stop_the_others(self):
        db = _Db(fail_on={"r1"})
        client = _Client([_row("r1", 30), _row("r2", 30)])
        report = await sweep_undelivered_runs(db=db, client=client)
        assert report["swept"] == 1
        assert db.failed == [("r2", UNDELIVERED_CODE)]

    @pytest.mark.asyncio
    async def test_the_slice_is_bounded(self):
        db = _Db()
        client = _Client([])
        await sweep_undelivered_runs(db=db, client=client, limit=25)
        assert client.params["limit"] == "25"
