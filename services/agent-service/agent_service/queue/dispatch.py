"""Exclusive run dispatch — never enqueue and execute inline in the same request."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any

from agent_service.config import get_settings
from agent_service.supabase_client import Persistence

logger = logging.getLogger(__name__)

ExecuteFn = Callable[[], Awaitable[dict[str, Any]]]


async def bump_dispatch_seq(db: Persistence, run_id: str, user_id: str) -> int:
    """Stamp a fencing token so a deliberate re-dispatch is not read as a retry.

    Cloud Tasks redelivers the same task after a timeout, and the worker must
    skip those. But a run that pauses for user input and is then resumed is
    enqueued again on purpose, with the run still in "running" — indistinguishable
    from a redelivery by status alone. That ambiguity silently killed builds:
    the resume was dropped as a duplicate and the run sat at its last event
    forever.

    Every deliberate enqueue increments this counter; a redelivery carries the
    same value the worker already claimed.
    """
    rows = await db._select("runs", {"id": f"eq.{run_id}", "select": "input", "limit": "1"})
    current = 0
    if rows:
        current = int((rows[0].get("input") or {}).get("dispatch_seq") or 0)
    nxt = current + 1
    await db.merge_run_input(run_id, user_id, {"dispatch_seq": nxt})
    return nxt


async def enqueue_run(
    *,
    db: Persistence,
    run_id: str,
    user_id: str,
) -> dict[str, Any]:
    """Route enqueue to Cloud Tasks or Postgres ``run_queue`` based on QUEUE_BACKEND."""
    settings = get_settings()
    await bump_dispatch_seq(db, run_id, user_id)
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
