"""Application factory for the Stack32 Agent Service."""

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agent_service import __version__
from agent_service.config import get_settings
from agent_service.errors import register_exception_handlers
from agent_service.gateway.model_gateway import provider_health
from agent_service.logging_config import setup_logging
from agent_service.middleware import RequestIDMiddleware
from agent_service.routers import (
    agents,
    builder,
    connections,
    health,
    knowledge,
    live,
    runs,
    secrets,
    tasks,
    webhooks,
)


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    settings = get_settings()
    setup_logging(settings.LOG_LEVEL)

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
    v1.include_router(tasks.router)
    v1.include_router(webhooks.router)
    app.include_router(v1)

    @app.get("/v1/providers/health")
    async def providers_health() -> dict:
        return {"providers": [p.model_dump() for p in provider_health()]}

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
