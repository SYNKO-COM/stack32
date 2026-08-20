"""Live runtime API."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

from agent_service.auth import CurrentUser
from agent_service.runtime.live import LiveRuntime
from agent_service.security.rate_limit import (
    BudgetExceeded,
    PlanLimitExceeded,
    RateLimitExceeded,
    check_concurrent_runs,
    check_installation_rate_limit,
    check_live_message_limit,
    check_monthly_budget,
    check_user_rate_limit,
)
from agent_service.supabase_client import get_persistence

router = APIRouter(tags=["live"])


class LiveImagePayload(BaseModel):
    name: str = Field(default="", max_length=240)
    mime_type: str = Field(default="image/jpeg", max_length=100)
    data_base64: str = Field(min_length=8, max_length=12_000_000)


class LiveMessageRequest(BaseModel):
    content: str = Field(default="", max_length=8000)
    use_published: bool = False
    locale: str = Field(default="en", max_length=8)
    images: list[LiveImagePayload] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def require_text_or_images(self) -> LiveMessageRequest:
        if not self.content.strip() and not self.images:
            raise ValueError("content or images required")
        return self


@router.post("/live/threads/{thread_id}/messages")
async def post_live_message(
    thread_id: UUID,
    body: LiveMessageRequest,
    user: CurrentUser,
) -> dict[str, Any]:
    try:
        await check_user_rate_limit(user.user_id)
        await check_monthly_budget(user.user_id)
        await check_live_message_limit(user.user_id)
        await check_concurrent_runs(user_id=user.user_id, kind="live")
    except RateLimitExceeded as exc:
        raise HTTPException(status_code=429, detail={"code": exc.code, "message": "Rate limit."}) from exc
    except BudgetExceeded as exc:
        raise HTTPException(status_code=402, detail={"code": exc.code, "message": "Budget exceeded."}) from exc
    except PlanLimitExceeded as exc:
        raise HTTPException(
            status_code=403,
            detail={"code": exc.code, "message": "Live message limit reached."},
        ) from exc

    db = get_persistence()
    rows = await db._select(
        "live_threads",
        {
            "id": f"eq.{thread_id}",
            "user_id": f"eq.{user.user_id}",
            "select": "id,agent_id,installation_id",
            "limit": "1",
        },
    )
    if not rows:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Thread not found."})

    try:
        await check_installation_rate_limit(rows[0].get("installation_id"))
    except RateLimitExceeded as exc:
        raise HTTPException(status_code=429, detail={"code": exc.code, "message": "Rate limit."}) from exc

    runtime = LiveRuntime(db)
    result = await runtime.handle_message(
        user_id=user.user_id,
        agent_id=rows[0]["agent_id"],
        thread_id=str(thread_id),
        content=body.content,
        use_published=body.use_published,
        images=[img.model_dump() for img in body.images],
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
