"""Transient DB errors must degrade gracefully — never fail a Live run."""

import pytest
from fastapi import HTTPException

from agent_service.runtime.context import load_live_history


class _FailingDb:
    async def _select(self, table, params):
        raise HTTPException(
            status_code=502,
            detail={"code": "upstream_error", "message": "Database query failed."},
        )


class _OkDb:
    async def _select(self, table, params):
        return [
            {"id": "2", "role": "assistant", "content": "Hi!", "created_at": "2026-01-01T00:00:01Z"},
            {"id": "1", "role": "user", "content": "Hello", "created_at": "2026-01-01T00:00:00Z"},
        ]


@pytest.mark.asyncio
async def test_history_degrades_to_empty_on_db_error():
    # Prod regression: a Supabase 502 in load_live_history failed the whole run.
    history = await load_live_history(
        db=_FailingDb(), thread_id="t", user_id="u", agent_id="a"
    )
    assert history == []


@pytest.mark.asyncio
async def test_history_loads_normally():
    history = await load_live_history(
        db=_OkDb(), thread_id="t", user_id="u", agent_id="a"
    )
    assert [m["role"] for m in history] == ["user", "assistant"]
