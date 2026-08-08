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


@router.post("/tasks/schedules/tick")
async def tick_schedules(_: InternalService) -> dict[str, Any]:
    """Find due agent_schedules and enqueue live runs (audited)."""
    from datetime import UTC, datetime
    import uuid

    from agent_service.supabase_client import get_persistence, get_supabase_admin_client

    db = get_persistence()
    enqueued: list[str] = []
    async with get_supabase_admin_client() as client:
        response = await client.get(
            "/agent_schedules",
            params={
                "enabled": "eq.true",
                "select": "id,agent_id,user_id,cron_expression,config",
                "limit": "50",
            },
        )
        rows = response.json() if response.status_code < 400 else []
    for row in rows if isinstance(rows, list) else []:
        user_id = row.get("user_id")
        agent_id = row.get("agent_id")
        if not user_id or not agent_id:
            continue
        # Hourly placeholder: always fire when tick is called (external cron every hour).
        run_id = str(uuid.uuid4())
        await db.create_run(
            run_id=run_id,
            user_id=user_id,
            agent_id=agent_id,
            kind="live",
            thread_id=None,
            status="queued",
            input_payload={
                "prompt": "Scheduled run",
                "schedule_id": row["id"],
                "triggered_at": datetime.now(UTC).isoformat(),
            },
        )
        await db.enqueue_run(run_id=run_id, user_id=user_id)
        await db.audit(
            user_id=user_id,
            agent_id=agent_id,
            action="schedule_tick",
            resource_type="agent_schedule",
            resource_id=row["id"],
            result="success",
            risk_level="medium",
            metadata={"run_id": run_id},
        )
        enqueued.append(run_id)
    return {"enqueued": enqueued, "count": len(enqueued)}
