"""Knowledge namespace — ingestion pipeline arrives in Phase 6."""

from fastapi import APIRouter, HTTPException

from agent_service.auth import CurrentUser

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.post("/sources/{source_id}/ingest")
async def ingest_source(source_id: str, user: CurrentUser) -> None:
    raise HTTPException(
        status_code=501,
        detail={
            "code": "not_implemented",
            "message": "Knowledge ingestion is not implemented yet (Phase 6).",
        },
    )
