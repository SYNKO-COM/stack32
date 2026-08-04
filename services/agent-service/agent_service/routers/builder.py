"""Builder namespace — NOT_IMPLEMENTED until the real Builder Agent (Phase 3)."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agent_service.auth import CurrentUser

router = APIRouter(prefix="/builder", tags=["builder"])


class BuilderMessageRequest(BaseModel):
    content: str = Field(min_length=1)


def _not_implemented() -> HTTPException:
    return HTTPException(
        status_code=501,
        detail={
            "code": "not_implemented",
            "message": "Builder execution is not implemented yet (Phase 3).",
        },
    )


@router.post("/threads/{thread_id}/messages")
async def post_builder_message(
    thread_id: str, body: BuilderMessageRequest, user: CurrentUser
) -> None:
    raise _not_implemented()


@router.post("/threads/{thread_id}/repair")
async def repair(thread_id: str, user: CurrentUser) -> None:
    raise _not_implemented()
