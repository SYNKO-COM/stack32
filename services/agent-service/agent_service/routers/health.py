"""Health and readiness endpoints (no auth, not versioned)."""

from fastapi import APIRouter

from agent_service import __version__
from agent_service.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    """Liveness: the process is up."""
    return {"status": "ok", "service": "agent-service", "version": __version__}


@router.get("/ready")
async def ready() -> dict[str, object]:
    """Readiness: required configuration is present.

    Reports which subsystems are configured without leaking any values.
    """
    settings = get_settings()
    checks = {
        "supabase_url": bool(settings.SUPABASE_URL),
        "supabase_service_role": bool(settings.SUPABASE_SERVICE_ROLE_KEY),
        "jwt_verification": bool(settings.SUPABASE_JWKS_URL or settings.SUPABASE_JWT_SECRET),
    }
    return {"status": "ready" if all(checks.values()) else "degraded", "checks": checks}
