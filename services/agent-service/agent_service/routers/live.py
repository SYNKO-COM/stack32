"""Live (end-user) conversation endpoints (Phase 1: mock data only)."""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from agent_service.auth import CurrentUser
from agent_service.mock_data import new_id

router = APIRouter(prefix="/live", tags=["live"])


class LiveMessageRequest(BaseModel):
    content: str = Field(min_length=1)


class ChatMessage(BaseModel):
    role: str
    content: str


class LiveMessageResponse(BaseModel):
    run_id: str
    message: ChatMessage


@router.post("/threads/{thread_id}/messages", response_model=LiveMessageResponse)
async def post_live_message(
    thread_id: str, body: LiveMessageRequest, user: CurrentUser
) -> LiveMessageResponse:
    # TODO(phase-2): dispatch the message to the published agent runtime and
    # persist the thread history.
    return LiveMessageResponse(
        run_id=new_id("run"),
        message=ChatMessage(
            role="assistant",
            content=(
                "Here's what I found: Acme Corp is a mid-market logistics SaaS "
                "(~200 employees). Lead score: 8/10 — strong fit with your ICP. "
                "I've drafted a personalized email for their VP of Operations."
            ),
        ),
    )
