"""Builder API — real Phase 3 orchestration."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from agent_service.auth import CurrentUser
from agent_service.builder.orchestrator import BuilderOrchestrator
from agent_service.security.rate_limit import (
    BudgetExceeded,
    RateLimitExceeded,
    check_monthly_budget,
    check_user_rate_limit,
)
from agent_service.supabase_client import get_persistence

router = APIRouter(tags=["builder"])


class BuilderMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=8000)
    thread_id: UUID | None = None
    # UI language the assistant must answer in, regardless of the prompt language.
    locale: str = Field(default="en", max_length=8)


class IdentityResumeRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    role: str = Field(min_length=1, max_length=240)
    tone: str = Field(default="professional", max_length=64)
    description: str = Field(default="", max_length=2000)
    request_id: UUID | None = None


def _http_from_result(result: dict[str, Any]) -> dict[str, Any]:
    if result.get("error") == "forbidden":
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Agent not found."})
    if result.get("error") in ("BUILDER_INPUT_REJECTED",):
        raise HTTPException(
            status_code=400,
            detail={"code": result["error"], "message": "Invalid builder input."},
        )
    return result


async def _guards(user_id: str) -> None:
    try:
        await check_user_rate_limit(user_id)
        await check_monthly_budget(user_id)
    except RateLimitExceeded as exc:
        raise HTTPException(status_code=429, detail={"code": exc.code, "message": "Rate limit exceeded."}) from exc
    except BudgetExceeded as exc:
        raise HTTPException(
            status_code=402, detail={"code": exc.code, "message": "Monthly model budget exceeded."}
        ) from exc


@router.post("/agents/{agent_id}/builder/messages")
async def post_agent_builder_message(
    agent_id: UUID,
    body: BuilderMessageRequest,
    user: CurrentUser,
    request: Request,
) -> dict[str, Any]:
    await _guards(user.user_id)
    db = get_persistence()
    agent = await db.get_owned_agent(str(agent_id), user.user_id)
    if not agent:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Agent not found."})
    thread_id = str(body.thread_id) if body.thread_id else None
    if not thread_id:
        # Resolve builder thread from agent workspace
        rows = await db._select(
            "builder_threads",
            {
                "agent_id": f"eq.{agent_id}",
                "user_id": f"eq.{user.user_id}",
                "select": "id",
                "limit": "1",
            },
        )
        if not rows:
            raise HTTPException(
                status_code=404, detail={"code": "not_found", "message": "Builder thread not found."}
            )
        thread_id = rows[0]["id"]

    orch = BuilderOrchestrator(db)
    result = await orch.handle_message(
        user_id=user.user_id,
        agent_id=str(agent_id),
        thread_id=thread_id,
        content=body.content,
        locale=body.locale,
    )
    return _http_from_result(result)


@router.post("/builder/runs/{run_id}/identity")
async def submit_identity(
    run_id: UUID,
    body: IdentityResumeRequest,
    user: CurrentUser,
) -> dict[str, Any]:
    await _guards(user.user_id)
    orch = BuilderOrchestrator()
    result = await orch.resume_with_identity(
        run_id=str(run_id),
        user_id=user.user_id,
        name=body.name,
        role=body.role,
        tone=body.tone,
        description=body.description,
    )
    if result.get("error") == "BUILDER_INTERRUPTED":
        raise HTTPException(
            status_code=409,
            detail={"code": "BUILDER_INTERRUPTED", "message": "Cannot resume this run."},
        )
    return _http_from_result(result)


@router.post("/builder/runs/{run_id}/resume")
async def resume_builder_run(run_id: UUID, user: CurrentUser) -> dict[str, Any]:
    from agent_service.queue.worker import process_run_by_id

    db = get_persistence()
    run = await db.get_owned_run(str(run_id), user.user_id)
    if not run:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Run not found."})
    return await process_run_by_id(str(run_id))


@router.post("/agents/{agent_id}/test")
async def test_agent(agent_id: UUID, user: CurrentUser) -> dict[str, Any]:
    await _guards(user.user_id)
    db = get_persistence()
    spec = await db.load_draft_spec(str(agent_id), user.user_id)
    if not spec:
        raise HTTPException(
            status_code=400, detail={"code": "AGENT_SPEC_INVALID", "message": "No draft spec."}
        )
    orch = BuilderOrchestrator(db)
    report = await orch._run_smoke_test(spec, user_id=user.user_id, agent_id=str(agent_id))
    return {"test_report": report}


@router.post("/agents/{agent_id}/repair")
async def repair_agent(agent_id: UUID, user: CurrentUser) -> dict[str, Any]:
    await _guards(user.user_id)
    db = get_persistence()
    rows = await db._select(
        "builder_threads",
        {
            "agent_id": f"eq.{agent_id}",
            "user_id": f"eq.{user.user_id}",
            "select": "id",
            "limit": "1",
        },
    )
    if not rows:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Thread not found."})
    orch = BuilderOrchestrator(db)
    return await orch.repair_agent(
        user_id=user.user_id, agent_id=str(agent_id), thread_id=rows[0]["id"]
    )


@router.get("/agents/{agent_id}/builder/state")
async def builder_state(agent_id: UUID, user: CurrentUser) -> dict[str, Any]:
    db = get_persistence()
    agent = await db.get_owned_agent(str(agent_id), user.user_id)
    if not agent:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Agent not found."})
    spec = await db.load_draft_spec(str(agent_id), user.user_id)
    return {
        "agent": {
            "id": agent["id"],
            "name": agent["name"],
            "status": agent["status"],
        },
        "has_spec": spec is not None,
        "schema_version": spec.schema_version if spec else None,
    }


# Legacy path kept for compatibility with older clients/tests
@router.post("/builder/threads/{thread_id}/messages")
async def post_builder_message_legacy(
    thread_id: UUID,
    body: BuilderMessageRequest,
    user: CurrentUser,
) -> dict[str, Any]:
    await _guards(user.user_id)
    db = get_persistence()
    rows = await db._select(
        "builder_threads",
        {
            "id": f"eq.{thread_id}",
            "user_id": f"eq.{user.user_id}",
            "select": "id,agent_id",
            "limit": "1",
        },
    )
    if not rows:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Thread not found."})
    orch = BuilderOrchestrator(db)
    result = await orch.handle_message(
        user_id=user.user_id,
        agent_id=rows[0]["agent_id"],
        thread_id=str(thread_id),
        content=body.content,
    )
    return _http_from_result(result)


@router.post("/builder/threads/{thread_id}/repair")
async def repair_legacy(thread_id: UUID, user: CurrentUser) -> dict[str, Any]:
    db = get_persistence()
    rows = await db._select(
        "builder_threads",
        {
            "id": f"eq.{thread_id}",
            "user_id": f"eq.{user.user_id}",
            "select": "id,agent_id",
            "limit": "1",
        },
    )
    if not rows:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Thread not found."})
    orch = BuilderOrchestrator(db)
    return await orch.repair_agent(
        user_id=user.user_id,
        agent_id=rows[0]["agent_id"],
        thread_id=str(thread_id),
    )
