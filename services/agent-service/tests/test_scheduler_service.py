"""M5 — due-based scheduler service (fakes; no live DB)."""

from __future__ import annotations

from typing import Any


class _Resp:
    def __init__(self, status_code: int, payload: Any):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> Any:
        return self._payload


class FakeClient:
    """Minimal PostgREST-like fake capturing calls and simulating occurrence conflict."""

    def __init__(self, claimed: list[dict], *, conflict: bool = False):
        self._claimed = claimed
        self._conflict = conflict
        self.created_occurrences: list[str] = []
        self.patches: list[tuple[str, dict]] = []

    async def post(self, path: str, json: dict | None = None, headers: dict | None = None):
        if path == "/rpc/claim_due_schedules":
            return _Resp(200, self._claimed)
        if path == "/schedule_occurrences":
            key = json["occurrence_key"]
            if self._conflict:
                return _Resp(409, {"message": "duplicate"})
            self.created_occurrences.append(key)
            return _Resp(201, [{"occurrence_key": key}])
        return _Resp(200, [])

    async def patch(self, path: str, params: dict | None = None, json: dict | None = None):
        self.patches.append((path, {"params": params, "json": json}))
        return _Resp(200, [])


class FakeDb:
    def __init__(self):
        self.runs: list[str] = []
        self.enqueued: list[str] = []
        self.audits: list[dict] = []

    async def create_run(self, **kwargs):
        self.runs.append(kwargs["run_id"])

    async def enqueue_run(self, **kwargs):
        self.enqueued.append(kwargs["run_id"])

    async def audit(self, **kwargs):
        self.audits.append(kwargs)


async def test_run_due_schedules_enqueues_and_advances():
    from agent_service.scheduling.service import run_due_schedules

    claimed = [
        {
            "id": "sched-1",
            "user_id": "u1",
            "agent_id": "a1",
            "cron_expression": "0 * * * *",
            "timezone": "UTC",
            "instruction": "Summarize inbox",
            "notify_email": "user@example.com",
            "next_run_at": "2026-01-01T10:00:00+00:00",
        }
    ]
    client = FakeClient(claimed)
    db = FakeDb()
    result = await run_due_schedules(db=db, client=client, limit=10)

    assert result["count"] == 1
    assert len(db.enqueued) == 1
    assert client.created_occurrences == ["sched-1:2026-01-01T10:00:00+00:00"]
    # next_run_at advanced to the following hour (11:00 UTC).
    next_patch = [
        p for p in client.patches if p[0] == "/agent_schedules"
    ]
    assert next_patch
    assert "2026-01-01T11:00:00" in str(next_patch[-1][1]["json"].get("next_run_at"))


async def test_run_due_schedules_is_idempotent_on_conflict():
    from agent_service.scheduling.service import run_due_schedules

    claimed = [
        {
            "id": "sched-1",
            "user_id": "u1",
            "agent_id": "a1",
            "cron_expression": "0 * * * *",
            "timezone": "UTC",
            "next_run_at": "2026-01-01T10:00:00+00:00",
        }
    ]
    client = FakeClient(claimed, conflict=True)
    db = FakeDb()
    result = await run_due_schedules(db=db, client=client, limit=10)

    assert result["count"] == 0
    assert result["skipped"] == 1
    assert db.enqueued == []


async def test_default_prompt_used_when_no_instruction():
    from agent_service.scheduling.service import DEFAULT_SCHEDULED_PROMPT, run_due_schedules

    captured: dict = {}

    class CapturingDb(FakeDb):
        async def create_run(self, **kwargs):
            captured.update(kwargs)
            await super().create_run(**kwargs)

    claimed = [
        {
            "id": "sched-2",
            "user_id": "u1",
            "agent_id": "a1",
            "cron_expression": "0 9 * * *",
            "timezone": "UTC",
            "next_run_at": None,
        }
    ]
    await run_due_schedules(db=CapturingDb(), client=FakeClient(claimed), limit=10)
    assert captured["input_payload"]["prompt"] == DEFAULT_SCHEDULED_PROMPT
