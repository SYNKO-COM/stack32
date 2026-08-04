"""Application factory for the Stack32 Agent Service."""

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agent_service import __version__
from agent_service.config import get_settings
from agent_service.errors import register_exception_handlers
from agent_service.logging_config import setup_logging
from agent_service.middleware import RequestIDMiddleware
from agent_service.routers import agents, builder, health, knowledge, live, runs, webhooks


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
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    app.include_router(health.router)

    v1 = APIRouter(prefix="/v1")
    v1.include_router(agents.router)
    v1.include_router(builder.router)
    v1.include_router(live.router)
    v1.include_router(runs.router)
    v1.include_router(knowledge.router)
    v1.include_router(webhooks.router)
    app.include_router(v1)

    return app


app = create_app()
