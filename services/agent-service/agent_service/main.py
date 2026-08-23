"""Application factory for the Stack32 Agent Service."""

import logging

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agent_service import __version__
from agent_service.config import get_settings
from agent_service.errors import register_exception_handlers
from agent_service.logging_config import setup_logging
from agent_service.middleware import RequestIDMiddleware
from agent_service.routers import (
    agents,
    builder,
    connections,
    health,
    installations,
    integrations,
    knowledge,
    live,
    runs,
    secrets,
    tasks,
    transcribe,
    webhooks,
)

logger = logging.getLogger(__name__)


def _check_production_runtime(settings) -> None:
    """Fail hard on unsafe production / production-like configuration."""
    if not getattr(settings, "is_production_like", False) and not settings.is_production:
        return
    errors: list[str] = []
    if settings.ALLOW_UNVERIFIED_JWT:
        errors.append("ALLOW_UNVERIFIED_JWT must be false in production")
    if settings.AI_EXECUTION_MODE == "mock":
        errors.append("AI_EXECUTION_MODE=mock is forbidden in production / production-like")
    if settings.AGENT_RUNTIME_VERSION == "legacy":
        errors.append("AGENT_RUNTIME_VERSION=legacy is forbidden; use langgraph")
    if settings.SANDBOX_PROVIDER == "local":
        errors.append("SANDBOX_PROVIDER=local is not allowed in production / production-like")
    if not (settings.SECRETS_ENCRYPTION_KEY or "").strip():
        errors.append("SECRETS_ENCRYPTION_KEY is required in production")
    if settings.AGENT_RUNTIME_VERSION == "langgraph" and not (settings.DATABASE_URL or "").strip():
        errors.append(
            "AGENT_RUNTIME_VERSION=langgraph requires DATABASE_URL "
            "(MemorySaver is forbidden)"
        )
    if errors:
        raise RuntimeError("Production startup checks failed: " + "; ".join(errors))


# Values operators use as "not configured yet". Secret Manager has no concept of
# an empty secret, so a placeholder string is the usual stand-in.
_PLACEHOLDER_SECRETS = frozenset({"unset", "none", "null", "todo", "changeme", "-", "n/a"})


def _maybe_init_sentry(settings) -> None:
    """Optional Sentry init. Must never prevent the service from starting.

    Error reporting is a nice-to-have; serving traffic is not. A malformed DSN
    used to propagate BadDsn out of create_app and crash the container on boot —
    caught in preproduction where the mounted secret held the placeholder
    "unset". Degrade to no reporting and say so loudly instead.
    """
    dsn = (getattr(settings, "SENTRY_DSN", None) or "").strip()
    if not dsn or dsn.lower() in _PLACEHOLDER_SECRETS:
        if dsn:
            logger.warning("SENTRY_DSN is a placeholder (%r); error reporting disabled", dsn)
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration
    except ImportError:
        logger.warning("SENTRY_DSN set but sentry-sdk is not installed; skipping Sentry init")
        return
    try:
        _init_sentry_sdk(sentry_sdk, FastApiIntegration, LoggingIntegration, dsn, settings)
    except Exception:  # noqa: BLE001 - never let telemetry setup take down the service
        logger.exception("sentry_init_failed; continuing without error reporting")
        return
    logger.info("sentry_initialized environment=%s", settings.ENVIRONMENT)


def _init_sentry_sdk(sentry_sdk, FastApiIntegration, LoggingIntegration, dsn, settings) -> None:
    sentry_sdk.init(
        dsn=dsn,
        environment=getattr(settings, "ENVIRONMENT", "development") or "development",
        release=f"agent-service@{__version__}",
        integrations=[
            FastApiIntegration(),
            LoggingIntegration(level=None, event_level=None),
        ],
        traces_sample_rate=0.0,
        send_default_pii=False,
    )


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    settings = get_settings()
    setup_logging(settings.LOG_LEVEL)
    _check_production_runtime(settings)
    _maybe_init_sentry(settings)

    # /docs and /openapi.json publish the full 87-endpoint surface to anyone.
    # Useful in development, needless disclosure in production.
    expose_docs = not (settings.is_production or settings.is_production_like)
    app = FastAPI(
        title="Stack32 Agent Service",
        version=__version__,
        description="API for building and running Stack32 AI agents.",
        docs_url="/docs" if expose_docs else None,
        redoc_url="/redoc" if expose_docs else None,
        openapi_url="/openapi.json" if expose_docs else None,
    )

    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Internal-Token", "X-PD-Signature"],
    )

    register_exception_handlers(app)

    app.include_router(health.router)

    v1 = APIRouter(prefix="/v1")
    v1.include_router(agents.router)
    v1.include_router(builder.router)
    v1.include_router(secrets.router)
    v1.include_router(live.router)
    v1.include_router(runs.router)
    v1.include_router(knowledge.router)
    v1.include_router(connections.router)
    v1.include_router(integrations.router)
    v1.include_router(tasks.router)
    v1.include_router(webhooks.router)
    v1.include_router(transcribe.router)
    v1.include_router(installations.router)
    app.include_router(v1)

    @app.on_event("startup")
    async def _maybe_start_queue_worker() -> None:
        if not settings.QUEUE_WORKER_ENABLED or settings.QUEUE_INLINE:
            return
        import asyncio

        async def _loop() -> None:
            from agent_service.queue.worker import poll_and_process_once

            while True:
                try:
                    await poll_and_process_once()
                except Exception:  # noqa: BLE001
                    pass
                await asyncio.sleep(2.0)

        asyncio.create_task(_loop())

    return app


app = create_app()
