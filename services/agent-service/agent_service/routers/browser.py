"""Chrome endpoints: web account authority and narrowly scoped device credentials."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header
from pydantic import BaseModel, ConfigDict, Field, field_validator

from agent_service.auth import CurrentUser
from agent_service.browser import service as b

router = APIRouter(prefix="/browser", tags=["browser"])


class SiteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    origin: str = Field(max_length=250)

    @field_validator("origin")
    @classmethod
    def validate_origin(cls, value: str) -> str:
        return b.origin_of(value)


class CreateSession(SiteRequest):
    installation_id: UUID
    thread_id: UUID


class Pair(SiteRequest):
    code: str = Field(pattern=r"^[a-f0-9]{64}$")


class Result(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Fixed result fields, no arbitrary pages/metadata/screenshots.
    text: str = Field(default="", max_length=4000)
    status: str = Field(pattern=r"^(read|interacted|denied|failed)$")


@router.post("/sessions")
async def create(body: CreateSession, user: CurrentUser):
    return await b.create_session(user.user_id, str(body.installation_id), str(body.thread_id), body.origin)


@router.post("/sessions/{session_id}/heartbeat")
async def heartbeat(session_id: UUID, user: CurrentUser):
    b.deployment_guard()
    rows = await b.request(
        "PATCH",
        "/browser_sessions",
        params={
            "id": f"eq.{session_id}",
            "user_id": f"eq.{user.user_id}",
            "state": "neq.revoked",
            "expires_at": f"gt.{b.stamp()}",
        },
        body={"web_seen_at": b.stamp()},
    )
    if not rows:
        b.fail("BROWSER_SESSION_EXPIRED")
    row = rows[0]
    await b.authorize(user.user_id, row["installation_id"], row["thread_id"])
    return {
        "state": row["state"],
        "origin": row["origin"],
        "agent_name": row["agent_name"],
        "expires_at": row["expires_at"],
    }


@router.delete("/sessions/{session_id}")
async def revoke(session_id: UUID, user: CurrentUser):
    b.deployment_guard()
    await b.request("DELETE", "/browser_sessions", params={"id": f"eq.{session_id}", "user_id": f"eq.{user.user_id}"})
    return {"state": "revoked"}


@router.post("/pair")
async def pair(body: Pair):
    return await b.pair(body.code, body.origin)


async def device(authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        b.fail("BROWSER_PAIRING_REQUIRED", 401)
    return await b.session_for_device(authorization[7:])


@router.post("/device/poll")
async def poll(authorization: Annotated[str | None, Header()] = None):
    row = await device(authorization)
    await b.request(
        "PATCH",
        "/browser_sessions",
        params={"id": f"eq.{row['id']}", "state": "eq.active"},
        body={"device_seen_at": b.stamp()},
    )
    # Claim once: retries/popup reopens must not replay side effects.
    commands = await b.request(
        "PATCH",
        "/browser_commands",
        params={"session_id": f"eq.{row['id']}", "state": "eq.pending", "expires_at": f"gt.{b.stamp()}"},
        body={"state": "claimed"},
    )
    return {
        "commands": commands,
        "origin": row["origin"],
        "agent_name": row["agent_name"],
        "expires_at": row["expires_at"],
    }


@router.post("/device/commands/{command_id}/validate")
async def validate(command_id: UUID, authorization: Annotated[str | None, Header()] = None):
    row = await device(authorization)
    commands = await b.request(
        "GET",
        "/browser_commands",
        params={
            "id": f"eq.{command_id}",
            "session_id": f"eq.{row['id']}",
            "state": "eq.claimed",
            "expires_at": f"gt.{b.stamp()}",
        },
    )
    if not commands:
        b.fail("BROWSER_COMMAND_EXPIRED")
    return {"valid": True}


@router.post("/device/commands/{command_id}/result")
async def result(command_id: UUID, body: Result, authorization: Annotated[str | None, Header()] = None):
    row = await device(authorization)
    commands = await b.request(
        "PATCH",
        "/browser_commands",
        params={
            "id": f"eq.{command_id}",
            "session_id": f"eq.{row['id']}",
            "state": "eq.claimed",
            "expires_at": f"gt.{b.stamp()}",
        },
        body={"state": "done", "result": body.model_dump(), "action": {}},
    )
    if not commands:
        b.fail("BROWSER_COMMAND_EXPIRED")
    return {"received": True}


@router.delete("/device")
async def stop(authorization: Annotated[str | None, Header()] = None):
    row = await device(authorization)
    await b.request("DELETE", "/browser_sessions", params={"id": f"eq.{row['id']}"})
    return {"state": "revoked"}
