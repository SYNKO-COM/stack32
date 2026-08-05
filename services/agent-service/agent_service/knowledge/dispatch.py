"""Shared helpers for knowledge ingestion run dispatch."""

from __future__ import annotations

from typing import Any

from agent_service.queue.dispatch import dispatch_run
from agent_service.queue.worker import process_run_by_id
from agent_service.supabase_client import Persistence


async def dispatch_ingestion(db: Persistence, *, run_id: str, user_id: str) -> dict[str, Any]:
    return await dispatch_run(
        db=db,
        run_id=run_id,
        user_id=user_id,
        execute=lambda: process_run_by_id(run_id),
    )
