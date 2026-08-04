"""Health check endpoint (no auth, not versioned)."""

from fastapi import APIRouter

from agent_service import __version__

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "agent-service", "version": __version__}
