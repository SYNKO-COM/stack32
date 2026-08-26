"""Free plan gets three wakes, then the paywall.

Each wake deploys a real Pipedream source on the platform's account, so the
free tier caps them at three — lifetime, counted in ``usage_events`` under
``trigger.wake``. The fourth attempt must answer 402 with ``PLAN_WAKE_LIMIT``
so the web app opens the upgrade dialog instead of pretending to listen.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from agent_service.routers.agents import start_trigger_listen

USER = SimpleNamespace(user_id="user-wake")


class _Response:
    def __init__(self, rows):
        self.status_code = 200
        self._rows = rows

    def json(self):
        return self._rows


class _Client:
    def __init__(self, wake_rows):
        self.wake_rows = wake_rows

    async def get(self, path, params=None):
        assert path == "/usage_events"
        assert params["event_name"] == "eq.trigger.wake"
        return _Response(self.wake_rows)


class _Persistence:
    def __init__(self):
        self.recorded = []

    async def get_owned_agent(self, agent_id, user_id):
        return {"id": agent_id, "status": "draft"}

    async def record_usage_event(self, **kwargs):
        self.recorded.append(kwargs)


@pytest.fixture
def wired(monkeypatch):
    """Wire the endpoint's lazy imports; returns the mutable test doubles."""
    state = SimpleNamespace(
        persistence=_Persistence(),
        wake_rows=[],
        listened=[],
    )

    @asynccontextmanager
    async def fake_admin_client():
        yield _Client(state.wake_rows)

    async def fake_listen(**kwargs):
        state.listened.append(kwargs)
        return {"status": "listening", "mode": "listen"}

    async def fake_budget_context(user_id):
        return None, state.plan_key, 0

    state.plan_key = "free"
    monkeypatch.setattr(
        "agent_service.routers.agents.get_persistence", lambda: state.persistence
    )
    monkeypatch.setattr(
        "agent_service.supabase_client.get_supabase_admin_client", fake_admin_client
    )
    monkeypatch.setattr(
        "agent_service.triggers.service.listen_tool_trigger", fake_listen
    )
    monkeypatch.setattr(
        "agent_service.security.llm_budget.resolve_budget_context",
        fake_budget_context,
    )
    return state


class TestThreeWakesThenThePaywall:
    @pytest.mark.asyncio
    async def test_a_free_user_under_the_cap_wakes_and_is_counted(self, wired):
        wired.wake_rows = [{"id": "1"}, {"id": "2"}]
        result = await start_trigger_listen(uuid4(), USER)
        assert result["status"] == "listening"
        assert len(wired.listened) == 1
        assert wired.persistence.recorded[0]["event_name"] == "trigger.wake"

    @pytest.mark.asyncio
    async def test_the_fourth_wake_is_refused_with_the_plan_code(self, wired):
        wired.wake_rows = [{"id": "1"}, {"id": "2"}, {"id": "3"}]
        with pytest.raises(HTTPException) as exc:
            await start_trigger_listen(uuid4(), USER)
        assert exc.value.status_code == 402
        assert exc.value.detail["code"] == "PLAN_WAKE_LIMIT"
        assert wired.listened == []
        assert wired.persistence.recorded == []

    @pytest.mark.asyncio
    async def test_a_paid_plan_never_hits_the_counter(self, wired):
        wired.plan_key = "pro"
        wired.wake_rows = [{"id": str(n)} for n in range(50)]
        result = await start_trigger_listen(uuid4(), USER)
        assert result["status"] == "listening"

    @pytest.mark.asyncio
    async def test_a_broken_counter_fails_open(self, wired, monkeypatch):
        async def broken(user_id):
            raise RuntimeError("entitlements down")

        monkeypatch.setattr(
            "agent_service.security.llm_budget.resolve_budget_context", broken
        )
        result = await start_trigger_listen(uuid4(), USER)
        assert result["status"] == "listening"
