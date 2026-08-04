"""Live (end-user) conversation endpoints — NOT_IMPLEMENTED until Phase 5."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agent_service.auth import CurrentUser

router = APIRouter(prefix="/live", tags=["live"])


class LiveMessageRequest(BaseModel):
    content: str = Field(min_length=1)


@router.post("/threads/{thread_id}/messages")
async def post_live_message(
    thread_id: str, body: LiveMessageRequest, user: CurrentUser
) -> None:
    raise HTTPException(
        status_code=501,
        detail={
            "code": "not_implemented",
            "message": "Live execution is not implemented yet (arrives with the agent runtime).",
        },
    )
