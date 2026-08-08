"""User secrets API — BYOK (encrypted at rest, never returned in plaintext)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agent_service.auth import CurrentUser
from agent_service.builder.orchestrator import BuilderOrchestrator
from agent_service.security.rate_limit import (
    BudgetExceeded,
    RateLimitExceeded,
    check_monthly_budget,
    check_user_rate_limit,
)
from agent_service.security.user_secrets import list_secret_meta, upsert_llm_secret
from agent_service.supabase_client import get_persistence

router = APIRouter(tags=["secrets"])


class LlmSecretRequest(BaseModel):
    provider: str = Field(min_length=2, max_length=32)
    api_key: str = Field(min_length=8, max_length=512)
    label: str | None = Field(default=None, max_length=120)
    scope: str = Field(default="agent", pattern="^(agent|user)$")


class BuilderSecretResumeRequest(BaseModel):
    provider: str = Field(min_length=2, max_length=32)
    api_key: str = Field(min_length=8, max_length=512)


class BuilderCapabilitiesResumeRequest(BaseModel):
    memory_conversation: bool = True
    memory_semantic: bool = False
    knowledge_enabled: bool = False
    schedule_hourly: bool = False
    context_notes: str = Field(default="", max_length=2000)


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


@router.get("/agents/{agent_id}/secrets")
async def list_agent_secrets(agent_id: UUID, user: CurrentUser) -> dict[str, Any]:
    db = get_persistence()
    agent = await db.get_owned_agent(str(agent_id), user.user_id)
    if not agent:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Agent not found."})
    rows = await list_secret_meta(user_id=user.user_id, agent_id=str(agent_id))
    return {
        "secrets": [
            {
                "id": r.get("id"),
                "provider": r.get("provider"),
                "secret_kind": r.get("secret_kind"),
                "key_hint": r.get("key_hint"),
                "label": r.get("label"),
                "agent_id": r.get("agent_id"),
                "updated_at": r.get("updated_at"),
            }
            for r in rows
        ]
    }


@router.post("/agents/{agent_id}/secrets/llm")
async def store_llm_secret(
    agent_id: UUID,
    body: LlmSecretRequest,
    user: CurrentUser,
) -> dict[str, Any]:
    await _guards(user.user_id)
    db = get_persistence()
    agent = await db.get_owned_agent(str(agent_id), user.user_id)
    if not agent:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Agent not found."})
    try:
        meta = await upsert_llm_secret(
            user_id=user.user_id,
            agent_id=str(agent_id) if body.scope == "agent" else None,
            provider=body.provider,
            api_key=body.api_key,
            label=body.label,
        )
    except ValueError as exc:
        code = "INVALID_LLM_KEY" if "INVALID_LLM_KEY" in str(exc) else "INVALID_PROVIDER"
        raise HTTPException(
            status_code=400, detail={"code": code, "message": str(exc)}
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=500, detail={"code": "SECRET_STORE_FAILED", "message": "Could not store secret."}
        ) from exc

    await db.audit(
        user_id=user.user_id,
        agent_id=str(agent_id),
        action="secret_upsert",
        resource_type="user_secret",
        resource_id=body.provider,
        result="success",
        risk_level="high",
        metadata={"provider": body.provider, "hint_only": True, "scope": body.scope},
    )
    return {"status": "stored", "secret": meta}


@router.post("/builder/runs/{run_id}/secret")
async def submit_builder_secret(
    run_id: UUID,
    body: BuilderSecretResumeRequest,
    user: CurrentUser,
) -> dict[str, Any]:
    await _guards(user.user_id)
    orch = BuilderOrchestrator()
    try:
        result = await orch.resume_with_secret(
            run_id=str(run_id),
            user_id=user.user_id,
            provider=body.provider,
            api_key=body.api_key,
        )
    except ValueError as exc:
        code = "INVALID_LLM_KEY" if "INVALID_LLM_KEY" in str(exc) else "INVALID_PROVIDER"
        raise HTTPException(
            status_code=400, detail={"code": code, "message": str(exc)}
        ) from exc
    if result.get("error") == "BUILDER_INTERRUPTED":
        raise HTTPException(
            status_code=409,
            detail={"code": "BUILDER_INTERRUPTED", "message": "Cannot resume this run."},
        )
    return result


@router.post("/builder/runs/{run_id}/capabilities")
async def submit_builder_capabilities(
    run_id: UUID,
    body: BuilderCapabilitiesResumeRequest,
    user: CurrentUser,
) -> dict[str, Any]:
    await _guards(user.user_id)
    orch = BuilderOrchestrator()
    result = await orch.resume_with_capabilities(
        run_id=str(run_id),
        user_id=user.user_id,
        memory_conversation=body.memory_conversation,
        memory_semantic=body.memory_semantic,
        knowledge_enabled=body.knowledge_enabled,
        schedule_hourly=body.schedule_hourly,
        context_notes=body.context_notes,
    )
    if result.get("error") == "BUILDER_INTERRUPTED":
        raise HTTPException(
            status_code=409,
            detail={"code": "BUILDER_INTERRUPTED", "message": "Cannot resume this run."},
        )
    return result


class BuilderQuestionsResumeRequest(BaseModel):
    answers: dict[str, Any] = Field(default_factory=dict)


@router.post("/builder/runs/{run_id}/questions")
async def submit_builder_questions(
    run_id: UUID,
    body: BuilderQuestionsResumeRequest,
    user: CurrentUser,
) -> dict[str, Any]:
    await _guards(user.user_id)
    orch = BuilderOrchestrator()
    result = await orch.resume_with_questions(
        run_id=str(run_id),
        user_id=user.user_id,
        answers=body.answers,
    )
    if result.get("error") == "BUILDER_INTERRUPTED":
        raise HTTPException(
            status_code=409,
            detail={"code": "BUILDER_INTERRUPTED", "message": "Cannot resume this run."},
        )
    return result
