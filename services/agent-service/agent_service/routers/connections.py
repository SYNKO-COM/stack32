"""OAuth connections API."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agent_service.auth import CurrentUser
from agent_service.connections.manager import ConnectionError, ConnectionManager
from agent_service.supabase_client import get_persistence

router = APIRouter(tags=["connections"])


class StartGoogleRequest(BaseModel):
    agent_id: UUID | None = None
    tool_ids: list[str] = Field(default_factory=lambda: ["gmail", "calendar"])


class BindRequest(BaseModel):
    connection_id: UUID
    tool_ids: list[str] = Field(
        default_factory=lambda: ["gmail_list", "gmail_read", "gmail_send", "calendar_list"]
    )


class OAuthCallbackRequest(BaseModel):
    state: str = Field(min_length=8, max_length=200)
    code: str = Field(min_length=4, max_length=2000)


@router.post("/connections/google/start")
async def start_google(body: StartGoogleRequest, user: CurrentUser) -> dict[str, Any]:
    mgr = ConnectionManager()
    try:
        return await mgr.start_google_oauth(
            user_id=user.user_id,
            agent_id=str(body.agent_id) if body.agent_id else None,
            tool_ids=body.tool_ids,
        )
    except ConnectionError as exc:
        raise HTTPException(
            status_code=400, detail={"code": exc.code, "message": str(exc)}
        ) from exc


@router.post("/connections/google/callback")
async def google_callback(body: OAuthCallbackRequest, user: CurrentUser) -> dict[str, Any]:
    mgr = ConnectionManager()
    db = get_persistence()
    try:
        result = await mgr.complete_google_oauth(
            user_id=user.user_id, state=body.state, code=body.code
        )
    except ConnectionError as exc:
        raise HTTPException(
            status_code=400, detail={"code": exc.code, "message": str(exc)}
        ) from exc
    await db.audit(
        user_id=user.user_id,
        agent_id=None,
        action="connection_oauth_complete",
        resource_type="user_connection",
        resource_id=str(result.get("connection_id") or ""),
        result="success",
        risk_level="high",
        metadata={"provider": "google", "account_email": result.get("account_email")},
    )
    return result


@router.get("/connections")
async def list_connections(user: CurrentUser) -> dict[str, Any]:
    mgr = ConnectionManager()
    return {"connections": await mgr.list_connections(user_id=user.user_id)}


@router.post("/agents/{agent_id}/connections/bind")
async def bind_connection(
    agent_id: UUID, body: BindRequest, user: CurrentUser
) -> dict[str, Any]:
    mgr = ConnectionManager()
    try:
        binding = await mgr.bind_connection(
            user_id=user.user_id,
            agent_id=str(agent_id),
            connection_id=str(body.connection_id),
            tool_ids=body.tool_ids,
        )
    except ConnectionError as exc:
        raise HTTPException(
            status_code=400, detail={"code": exc.code, "message": str(exc)}
        ) from exc
    return {"binding": binding}


@router.get("/agents/{agent_id}/connections")
async def list_agent_bindings(agent_id: UUID, user: CurrentUser) -> dict[str, Any]:
    mgr = ConnectionManager()
    return {
        "bindings": await mgr.list_bindings(user_id=user.user_id, agent_id=str(agent_id)),
        "connections": await mgr.list_connections(user_id=user.user_id),
    }


@router.post("/connections/{connection_id}/revoke")
async def revoke_connection(connection_id: UUID, user: CurrentUser) -> dict[str, Any]:
    mgr = ConnectionManager()
    ok = await mgr.revoke(user_id=user.user_id, connection_id=str(connection_id))
    return {"revoked": ok}
