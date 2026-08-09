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
    """Warn or fail on unsafe production configuration."""
    if not settings.is_production and (settings.ENVIRONMENT or "").lower() != "production":
        return
    errors: list[str] = []
    warnings: list[str] = []
    if settings.ALLOW_UNVERIFIED_JWT:
        errors.append("ALLOW_UNVERIFIED_JWT must be false in production")
    if settings.SANDBOX_PROVIDER == "local":
        msg = "SANDBOX_PROVIDER=local is not allowed in production"
        if settings.BUILDER_SANDBOX_ENABLED:
            errors.append(msg)
        else:
            warnings.append(msg + " (sandbox disabled)")
    if not (settings.SECRETS_ENCRYPTION_KEY or "").strip():
        errors.append("SECRETS_ENCRYPTION_KEY is required in production")
    if settings.AGENT_RUNTIME_VERSION == "langgraph" and not (settings.DATABASE_URL or "").strip():
        errors.append(
            "AGENT_RUNTIME_VERSION=langgraph requires DATABASE_URL in production "
            "(MemorySaver is forbidden)"
        )
    for w in warnings:
        logger.warning("production_config_warning: %s", w)
    if errors:
        raise RuntimeError("Production startup checks failed: " + "; ".join(errors))


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    settings = get_settings()
    setup_logging(settings.LOG_LEVEL)
    _check_production_runtime(settings)

    app = FastAPI(
        title="Stack32 Agent Service",
        version=__version__,
        description="API for building and running Stack32 AI agents.",
    )

    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Internal-Token"],
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
