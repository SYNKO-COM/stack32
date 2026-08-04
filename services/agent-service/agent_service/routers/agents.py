"""Agent endpoints — Phase 2: persistence-safe reads + NOT_IMPLEMENTED stubs.

The frontend performs standard CRUD directly against Supabase (RLS-protected);
this service only exposes what the future runtime needs. Execution endpoints
return a typed NOT_IMPLEMENTED error until the real Builder Agent (Phase 3+).
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException

from agent_service.auth import CurrentUser
from agent_service.supabase_client import SupabaseRepository, get_repository

router = APIRouter(prefix="/agents", tags=["agents"])

Repo = Annotated[SupabaseRepository, Depends(get_repository)]


def _not_implemented(feature: str) -> HTTPException:
    return HTTPException(
        status_code=501,
        detail={
            "code": "not_implemented",
            "message": f"{feature} is not implemented yet (arrives with the real agent runtime).",
        },
    )


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=404,
        detail={"code": "not_found", "message": "Agent not found."},
    )


@router.get("/{agent_id}")
async def get_agent(agent_id: str, user: CurrentUser, repo: Repo) -> dict[str, Any]:
    agent = await repo.get_owned_agent(agent_id, user.user_id)
    if agent is None:
        raise _not_found()
    return agent


@router.get("/{agent_id}/versions")
async def list_agent_versions(
    agent_id: str, user: CurrentUser, repo: Repo
) -> list[dict[str, Any]]:
    agent = await repo.get_owned_agent(agent_id, user.user_id)
    if agent is None:
        raise _not_found()
    return await repo.list_agent_versions(agent_id)


@router.post("/{agent_id}/builder/messages")
async def post_builder_message(agent_id: str, user: CurrentUser) -> None:
    raise _not_implemented("Builder execution")


@router.post("/{agent_id}/test")
async def test_agent(agent_id: str, user: CurrentUser) -> None:
    raise _not_implemented("Agent testing")


@router.post("/{agent_id}/repair")
async def repair_agent(agent_id: str, user: CurrentUser) -> None:
    raise _not_implemented("Agent repair")


@router.post("/{agent_id}/publish")
async def publish_agent(agent_id: str, user: CurrentUser) -> None:
    raise _not_implemented("Publishing through the agent service")
