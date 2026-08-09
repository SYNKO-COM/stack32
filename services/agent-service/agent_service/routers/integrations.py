"""Hybrid integrations API — connect tokens, provider health, tool search."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from agent_service.auth import CurrentUser
from agent_service.integrations.pipedream.client import PipedreamClient
from agent_service.integrations.registry import get_provider_registry

router = APIRouter(tags=["integrations"])


class ConnectTokenRequest(BaseModel):
    external_user_id: str | None = Field(default=None, max_length=128)
    app_id: str | None = Field(default=None, max_length=128)


@router.post("/integrations/connect-token")
async def create_connect_token(
    body: ConnectTokenRequest, user: CurrentUser
) -> dict[str, Any]:
    external_user_id = (body.external_user_id or user.user_id).strip() or user.user_id
    client = PipedreamClient()
    result = await client.create_connect_token(external_user_id, app_id=body.app_id)
    return {
        "external_user_id": external_user_id,
        "app_id": body.app_id,
        "connect": result,
    }


@router.get("/integrations/apps/search")
async def search_integration_apps(
    user: CurrentUser,
    q: str = Query(default="", max_length=200),
    limit: int = Query(default=20, ge=1, le=50),
) -> dict[str, Any]:
    """Search the full Pipedream app catalog (3000+ apps)."""
    _ = user
    registry = get_provider_registry()
    apps = await registry.search_apps(q, limit=limit)
    return {"query": q, "apps": apps}


@router.get("/providers/health")
async def providers_health() -> dict[str, Any]:
    """Health for hybrid integration providers (+ LLM provider status)."""
    registry = get_provider_registry()
    integrations = await registry.health()
    llm: list[dict[str, Any]] = []
    try:
        from agent_service.gateway.model_gateway import provider_health

        llm = [p.model_dump() for p in provider_health()]
    except Exception:  # noqa: BLE001
        llm = []
    return {"providers": integrations, "llm": llm}


@router.get("/integrations/tools/search")
async def search_integration_tools(
    user: CurrentUser,
    q: str = Query(default="", max_length=200),
    limit: int = Query(default=20, ge=1, le=50),
) -> dict[str, Any]:
    _ = user
    registry = get_provider_registry()
    tools = await registry.search_tools(q, limit=limit)
    return {"query": q, "tools": [t.brief() for t in tools]}
