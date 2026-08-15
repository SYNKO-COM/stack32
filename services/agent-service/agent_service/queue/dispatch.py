"""Exclusive run dispatch — never enqueue and execute inline in the same request."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any

from agent_service.config import get_settings
from agent_service.supabase_client import Persistence

logger = logging.getLogger(__name__)

ExecuteFn = Callable[[], Awaitable[dict[str, Any]]]


async def enqueue_run(
    *,
    db: Persistence,
    run_id: str,
    user_id: str,
) -> dict[str, Any]:
    """Route enqueue to Cloud Tasks or Postgres ``run_queue`` based on QUEUE_BACKEND."""
    settings = get_settings()
    if settings.QUEUE_BACKEND == "cloud_tasks":
        from agent_service.queue.cloud_tasks import enqueue_via_cloud_tasks

        task_name = enqueue_via_cloud_tasks(run_id=run_id, user_id=user_id)
        return {"backend": "cloud_tasks", "task_name": task_name}

    await db.enqueue_run(run_id=run_id, user_id=user_id)
    return {"backend": "postgres"}


async def dispatch_run(
    *,
    db: Persistence,
    run_id: str,
    user_id: str,
    execute: ExecuteFn,
) -> dict[str, Any]:
    """
    QUEUE_INLINE=True  → execute immediately, do not enqueue.
    QUEUE_INLINE=False → enqueue only; worker claims later (return queued).
    """
    settings = get_settings()
    if settings.QUEUE_INLINE:
        return await execute()

    meta = await enqueue_run(db=db, run_id=run_id, user_id=user_id)
    return {
        "status": "queued",
        "run_id": run_id,
        "dispatch": "queue",
        "queue_backend": meta.get("backend"),
    }
