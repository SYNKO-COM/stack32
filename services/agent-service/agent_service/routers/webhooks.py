"""Internal webhooks namespace — service-to-service only."""

from fastapi import APIRouter, HTTPException

from agent_service.auth import InternalService

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/internal/ping")
async def internal_ping(_: InternalService) -> dict[str, str]:
    """Connectivity check for trusted internal callers (Next.js server)."""
    return {"status": "ok"}


@router.post("/whop")
async def whop_webhook(_: InternalService) -> None:
    # Whop webhooks are received by the Next.js app in Phase 2; a service-side
    # processor may land in Phase 7.
    raise HTTPException(
        status_code=501,
        detail={
            "code": "not_implemented",
            "message": "Webhook processing is not implemented in the agent service.",
        },
    )
