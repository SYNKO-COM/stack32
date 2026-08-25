"""Internal task handler for queued runs (Cloud Tasks / local worker)."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel, Field

from agent_service.auth import InternalService
from agent_service.queue.worker import process_run_by_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal", tags=["internal"])


class TaskPayload(BaseModel):
    run_id: UUID = Field(...)


@router.post("/tasks/run")
async def handle_run_task(body: TaskPayload, _: InternalService) -> dict[str, Any]:
    """Authenticated worker endpoint. Payload is run_id only."""
    return await process_run_by_id(str(body.run_id))


@router.post("/tasks/schedules/tick")
async def tick_schedules(_: InternalService) -> dict[str, Any]:
    """Claim due agent_schedules, then fail runs Cloud Tasks never delivered."""
    from agent_service.queue.sweeper import sweep_undelivered_runs
    from agent_service.scheduling.service import run_due_schedules
    from agent_service.supabase_client import get_persistence, get_supabase_admin_client

    db = get_persistence()
    async with get_supabase_admin_client() as client:
        result = await run_due_schedules(db=db, client=client, limit=50)
        # A delivery failure leaves the run queued forever and the Build view
        # spinning. Sweeping here costs one query per tick and turns silence
        # into a message the person can act on.
        try:
            result["undelivered"] = await sweep_undelivered_runs(db=db, client=client)
        except Exception:  # noqa: BLE001 - the tick's own work already succeeded
            logger.exception("undelivered_sweep_failed")
        return result
