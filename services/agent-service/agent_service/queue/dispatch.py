"""Exclusive run dispatch — never enqueue and execute inline in the same request."""

from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

from agent_service.config import get_settings
from agent_service.supabase_client import Persistence

logger = logging.getLogger(__name__)

ExecuteFn = Callable[[], Awaitable[dict[str, Any]]]


async def stamp_dispatch_token(db: Persistence, run_id: str, user_id: str) -> int:
    """Stamp a fencing token so a deliberate re-dispatch is not read as a retry.

    Cloud Tasks redelivers the same task after a timeout and the worker must skip
    those. But a run that pauses for user input and is then resumed is enqueued
    again on purpose, with the run still in "running" — indistinguishable from a
    redelivery by status alone. That ambiguity silently killed builds: the resume
    was dropped as a duplicate and the run sat at its last event forever.

    A millisecond timestamp is monotonic enough and needs no read-modify-write:
    every deliberate enqueue writes a fresh value, while a redelivery reads back
    the token the worker already claimed.
    """
    token = int(time.time() * 1000)
    try:
        await db.merge_run_input(run_id, user_id, {"dispatch_token": token})
    except Exception:  # noqa: BLE001 - fencing is best-effort; never block dispatch
        logger.warning("dispatch_token_stamp_failed run=%s", run_id, exc_info=True)
    return token


async def enqueue_run(
    *,
    db: Persistence,
    run_id: str,
    user_id: str,
) -> dict[str, Any]:
    """Route enqueue to Cloud Tasks or Postgres ``run_queue`` based on QUEUE_BACKEND."""
    settings = get_settings()
    await stamp_dispatch_token(db, run_id, user_id)
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
