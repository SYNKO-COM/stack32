"""Internal task handler for queued runs (Cloud Tasks / local worker)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel, Field

from agent_service.auth import InternalService
from agent_service.queue.worker import process_run_by_id

router = APIRouter(prefix="/internal", tags=["internal"])


class TaskPayload(BaseModel):
    run_id: UUID = Field(...)


@router.post("/tasks/run")
async def handle_run_task(body: TaskPayload, _: InternalService) -> dict[str, Any]:
    """Authenticated worker endpoint. Payload is run_id only."""
    return await process_run_by_id(str(body.run_id))
