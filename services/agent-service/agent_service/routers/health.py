"""Health and readiness endpoints (no auth, not versioned)."""

from fastapi import APIRouter, Response

from agent_service import __version__
from agent_service.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    """Liveness: the process is up."""
    return {"status": "ok", "service": "agent-service", "version": __version__}


@router.get("/ready")
async def ready(response: Response) -> dict[str, object]:
    """Readiness: required configuration is present.

    Reports which subsystems are configured without leaking any values.
    Fail-fast (HTTP 503) when production uses cloud_tasks without GCP config.
    """
    settings = get_settings()
    checks: dict[str, bool] = {
        "supabase_url": bool(settings.SUPABASE_URL),
        "supabase_service_role": bool(settings.SUPABASE_SERVICE_ROLE_KEY),
        "jwt_verification": bool(settings.SUPABASE_JWKS_URL or settings.SUPABASE_JWT_SECRET),
    }

    if settings.QUEUE_BACKEND == "cloud_tasks":
        from agent_service.queue.cloud_tasks import cloud_tasks_ready

        checks["cloud_tasks"] = cloud_tasks_ready(settings)
        # Production / production-like must not start serving with a broken queue.
        if (settings.is_production or settings.is_production_like) and not checks["cloud_tasks"]:
            response.status_code = 503
            return {"status": "not_ready", "checks": checks}

    ready_ok = all(checks.values())
    return {"status": "ready" if ready_ok else "degraded", "checks": checks}
