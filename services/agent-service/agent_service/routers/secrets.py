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
    scope: str = Field(default="installation", pattern="^(installation|agent|user)$")
    installation_id: str | None = Field(default=None, max_length=64)
    model_id: str | None = Field(default=None, max_length=200)


class BuilderSecretResumeRequest(BaseModel):
    provider: str = Field(min_length=2, max_length=32)
    # Optional — empty when the user connected via Pipedream Connect.
    api_key: str = Field(default="", max_length=512)
    model_id: str | None = Field(default=None, max_length=200)


class BuilderCapabilitiesResumeRequest(BaseModel):
    memory_conversation: bool = True
    memory_semantic: bool = False
    knowledge_enabled: bool = False
    schedule_hourly: bool = False
    tool_trigger: bool = False
    tool_trigger_app_id: str | None = Field(default=None, max_length=128)
    tool_trigger_component_id: str | None = Field(default=None, max_length=256)
    tool_trigger_label: str | None = Field(default=None, max_length=160)
    context_notes: str = Field(default="", max_length=2000)


class BuilderQuestionsResumeRequest(BaseModel):
    answers: dict[str, Any] = Field(default_factory=dict)


class BuilderToolReviewItem(BaseModel):
    tool_id: str = Field(min_length=1, max_length=128)
    provider: str = Field(default="native", max_length=64)
    app_id: str | None = Field(default=None, max_length=128)
    external_action_id: str | None = Field(default=None, max_length=256)
    utility: str = Field(default="", max_length=500)
    tool_ids: list[str] = Field(default_factory=list, max_length=40)


class BuilderToolReviewResumeRequest(BaseModel):
    tools: list[BuilderToolReviewItem] = Field(default_factory=list, max_length=20)


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
    from agent_service.installations.service import InstallationService

    # Owner or published consumer may configure their installation LLM.
    agent = await db.get_owned_agent(str(agent_id), user.user_id)
    if not agent:
        rows = await db._select(
            "agents",
            {
                "id": f"eq.{agent_id}",
                "status": "eq.published",
                "deleted_at": "is.null",
                "select": "id",
                "limit": "1",
            },
        )
        if not rows:
            raise HTTPException(
                status_code=404, detail={"code": "not_found", "message": "Agent not found."}
            )
    install = await InstallationService(db).get_or_create(
        user_id=user.user_id, agent_id=str(agent_id)
    )
    installation_id = body.installation_id or str(install["id"])
    if body.installation_id and body.installation_id != str(install["id"]):
        raise HTTPException(
            status_code=403,
            detail={"code": "INSTALLATION_FORBIDDEN", "message": "Installation mismatch."},
        )
    try:
        meta = await upsert_llm_secret(
            user_id=user.user_id,
            agent_id=str(agent_id) if body.scope != "user" else None,
            provider=body.provider,
            api_key=body.api_key,
            label=body.label,
            installation_id=installation_id if body.scope != "user" else None,
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
        metadata={
            "provider": body.provider,
            "hint_only": True,
            "scope": body.scope,
            "installation_id": installation_id,
            "model_id": body.model_id,
        },
    )
    if body.model_id and agent:
        spec = await db.load_draft_spec(str(agent_id), user.user_id)
        if spec:
            data = spec.model_dump()
            model = dict(data.get("model") or {})
            model["provider"] = body.provider.lower().strip()
            model["model_id"] = body.model_id.strip()
            model["credential_scope"] = "agent"
            model["fallback_enabled"] = False
            data["model"] = model
            from agent_service.models.agent_spec import AgentSpec

            updated = AgentSpec.model_validate(data)
            await db.persist_version(
                agent_id=str(agent_id),
                user_id=user.user_id,
                spec=updated,
                test_status="not_run",
                change_summary="Model updated",
            )
        from agent_service.security.user_secrets import validate_agent_model

        try:
            await validate_agent_model(
                user_id=user.user_id,
                agent_id=str(agent_id),
                provider=body.provider,
                model_id=body.model_id,
                api_key=body.api_key,
            )
        except Exception:
            pass
    return {"status": "stored", "secret": meta, "installation_id": installation_id}


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
            api_key=body.api_key or "",
            model_id=body.model_id,
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
    if result.get("error") == "LLM_CONFIGURATION_REQUIRED":
        raise HTTPException(
            status_code=400,
            detail={
                "code": "LLM_CONFIGURATION_REQUIRED",
                "message": result.get("message")
                or "Connect your LLM provider with Pipedream first.",
            },
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
        tool_trigger=body.tool_trigger,
        tool_trigger_app_id=body.tool_trigger_app_id,
        tool_trigger_component_id=body.tool_trigger_component_id,
        tool_trigger_label=body.tool_trigger_label,
        context_notes=body.context_notes,
    )
    if result.get("error") == "BUILDER_INTERRUPTED":
        raise HTTPException(
            status_code=409,
            detail={"code": "BUILDER_INTERRUPTED", "message": "Cannot resume this run."},
        )
    return result


@router.post("/builder/runs/{run_id}/connection")
async def submit_builder_connection(run_id: UUID, user: CurrentUser) -> dict[str, Any]:
    """Resume build after the user connected required accounts."""
    await _guards(user.user_id)
    orch = BuilderOrchestrator()
    result = await orch.resume_with_connection(run_id=str(run_id), user_id=user.user_id)
    if result.get("error") == "BUILDER_INTERRUPTED":
        raise HTTPException(
            status_code=409,
            detail={"code": "BUILDER_INTERRUPTED", "message": "Cannot resume this run."},
        )
    return result


@router.post("/agents/{agent_id}/builder/resume-connection")
async def resume_builder_connection_for_agent(
    agent_id: UUID, user: CurrentUser
) -> dict[str, Any]:
    """Locate an open connection interrupt for this agent and resume it."""
    await _guards(user.user_id)
    db = get_persistence()
    interrupt = await db.find_open_builder_interrupt(
        user_id=user.user_id, agent_id=str(agent_id), interrupt_type="connection"
    )
    if not interrupt or not interrupt.get("run_id"):
        return {"status": "noop", "reason": "no_open_connection_interrupt"}
    orch = BuilderOrchestrator()
    result = await orch.resume_with_connection(
        run_id=str(interrupt["run_id"]), user_id=user.user_id
    )
    if result.get("error") == "BUILDER_INTERRUPTED":
        raise HTTPException(
            status_code=409,
            detail={"code": "BUILDER_INTERRUPTED", "message": "Cannot resume this run."},
        )
    return result


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


@router.post("/builder/runs/{run_id}/providers")
async def submit_builder_providers(
    run_id: UUID,
    body: BuilderQuestionsResumeRequest,
    user: CurrentUser,
) -> dict[str, Any]:
    await _guards(user.user_id)
    orch = BuilderOrchestrator()
    result = await orch.resume_with_provider_clarification(
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


@router.post("/builder/runs/{run_id}/tools")
async def submit_builder_tool_review(
    run_id: UUID,
    body: BuilderToolReviewResumeRequest,
    user: CurrentUser,
) -> dict[str, Any]:
    await _guards(user.user_id)
    orch = BuilderOrchestrator()
    result = await orch.resume_with_tool_review(
        run_id=str(run_id),
        user_id=user.user_id,
        tools=[item.model_dump() for item in body.tools],
    )
    if result.get("error") == "BUILDER_INTERRUPTED":
        raise HTTPException(
            status_code=409,
            detail={"code": "BUILDER_INTERRUPTED", "message": "Cannot resume this run."},
        )
    return result
