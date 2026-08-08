"""Live runtime API."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agent_service.auth import CurrentUser
from agent_service.runtime.live import LiveRuntime
from agent_service.security.rate_limit import (
    BudgetExceeded,
    RateLimitExceeded,
    check_monthly_budget,
    check_user_rate_limit,
)
from agent_service.supabase_client import get_persistence

router = APIRouter(tags=["live"])


class LiveMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=8000)
    use_published: bool = False


@router.post("/live/threads/{thread_id}/messages")
async def post_live_message(
    thread_id: UUID,
    body: LiveMessageRequest,
    user: CurrentUser,
) -> dict[str, Any]:
    try:
        await check_user_rate_limit(user.user_id)
        await check_monthly_budget(user.user_id)
    except RateLimitExceeded as exc:
        raise HTTPException(status_code=429, detail={"code": exc.code, "message": "Rate limit."}) from exc
    except BudgetExceeded as exc:
        raise HTTPException(status_code=402, detail={"code": exc.code, "message": "Budget exceeded."}) from exc

    db = get_persistence()
    rows = await db._select(
        "live_threads",
        {
            "id": f"eq.{thread_id}",
            "user_id": f"eq.{user.user_id}",
            "select": "id,agent_id",
            "limit": "1",
        },
    )
    if not rows:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Thread not found."})

    runtime = LiveRuntime(db)
    result = await runtime.handle_message(
        user_id=user.user_id,
        agent_id=rows[0]["agent_id"],
        thread_id=str(thread_id),
        content=body.content,
        use_published=body.use_published,
    )
    if result.get("error") == "forbidden":
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Not found."})
    return result


@router.post("/live/runs/{run_id}/resume")
async def resume_live_run(run_id: UUID, user: CurrentUser) -> dict[str, Any]:
    from agent_service.queue.worker import process_run_by_id

    db = get_persistence()
    run = await db.get_owned_run(str(run_id), user.user_id)
    if not run:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Run not found."})
    return await process_run_by_id(str(run_id))


class ApprovalDecision(BaseModel):
    decision: str = Field(pattern="^(approved|denied)$")


@router.get("/agents/{agent_id}/approvals")
async def list_agent_approvals(agent_id: UUID, user: CurrentUser) -> dict[str, Any]:
    from agent_service.runtime.approvals import list_pending_approvals

    db = get_persistence()
    agent = await db.get_owned_agent(str(agent_id), user.user_id)
    if not agent:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Not found."})
    rows = await list_pending_approvals(user_id=user.user_id, agent_id=str(agent_id))
    return {"approvals": rows}


@router.post("/approvals/{approval_id}/decide")
async def decide_approval_endpoint(
    approval_id: UUID, body: ApprovalDecision, user: CurrentUser
) -> dict[str, Any]:
    from agent_service.runtime.approvals import decide_approval

    row = await decide_approval(
        user_id=user.user_id, approval_id=str(approval_id), decision=body.decision
    )
    if not row:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Approval not found."})
    return {"approval": row}
