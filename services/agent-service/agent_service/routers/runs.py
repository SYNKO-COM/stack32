"""Run endpoints — Phase 2: persistence-safe reads + cancel."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException

from agent_service.auth import CurrentUser
from agent_service.supabase_client import SupabaseRepository, get_repository

router = APIRouter(prefix="/runs", tags=["runs"])

Repo = Annotated[SupabaseRepository, Depends(get_repository)]


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=404,
        detail={"code": "not_found", "message": "Run not found."},
    )


@router.get("/{run_id}")
async def get_run(run_id: str, user: CurrentUser, repo: Repo) -> dict[str, Any]:
    run = await repo.get_owned_run(run_id, user.user_id)
    if run is None:
        raise _not_found()
    return run


@router.post("/{run_id}/cancel")
async def cancel_run(run_id: str, user: CurrentUser, repo: Repo) -> dict[str, Any]:
    run = await repo.get_owned_run(run_id, user.user_id)
    if run is None:
        raise _not_found()
    if run["status"] not in ("queued", "running"):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "conflict",
                "message": f"Run is already {run['status']} and cannot be canceled.",
            },
        )
    canceled = await repo.cancel_run(run_id, user.user_id)
    return canceled or run


@router.get("/{run_id}/stream")
async def stream_run(run_id: str, user: CurrentUser) -> None:
    """Real SSE run streaming arrives with the agent runtime (Phase 3+)."""
    raise HTTPException(
        status_code=501,
        detail={
            "code": "not_implemented",
            "message": "Run streaming is not implemented yet.",
        },
    )
