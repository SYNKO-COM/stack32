"""Run queue worker — continues execution after browser disconnect."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from agent_service.supabase_client import Persistence, get_supabase_admin_client

logger = logging.getLogger(__name__)


async def process_run_by_id(run_id: str) -> dict[str, Any]:
    """Load run context from DB and execute. Payload must only carry run_id."""
    db = Persistence()
    rows = await db._select(
        "runs",
        {"id": f"eq.{run_id}", "select": "*", "limit": "1"},
    )
    if not rows:
        return {"error": "not_found"}
    run = rows[0]
    user_id = run["user_id"]
    agent_id = run["agent_id"]
    thread_id = run.get("thread_id")
    run_type = run.get("run_type")
    status = run.get("status")

    if status in ("completed", "failed", "canceled"):
        return {"status": status, "run_id": run_id}

    if run_type == "build":
        # If interrupted for identity, do not auto-continue
        interrupt = (run.get("input") or {}).get("interrupt")
        if interrupt and interrupt.get("status") == "open":
            return {"status": "waiting_for_input", "run_id": run_id}
        from agent_service.builder.orchestrator import BuilderOrchestrator

        orch = BuilderOrchestrator(db)
        prompt = (run.get("input") or {}).get("prompt") or ""
        if not prompt:
            return {"status": "skipped", "run_id": run_id}
        return await orch.execute_build_run(
            run_id=run_id,
            user_id=user_id,
            agent_id=agent_id,
            thread_id=thread_id,
            content=prompt,
        )

    if run_type == "live":
        from agent_service.runtime.live import LiveRuntime

        runtime = LiveRuntime(db)
        spec = await db.load_draft_spec(agent_id, user_id)
        if not spec:
            await db.fail_run(run_id, "AGENT_SPEC_INVALID")
            return {"error": "AGENT_SPEC_INVALID"}
        payload = run.get("input") or {}
        content = payload.get("prompt") or ""
        result = await runtime.execute_live_run(
            run_id=run_id,
            user_id=user_id,
            agent_id=agent_id,
            thread_id=thread_id,
            content=content,
            spec=spec,
        )
        # Scheduled runs may request a terminal email. Delivery is best-effort:
        # a failure is recorded but must never change the run outcome.
        notify_email = payload.get("notify_email")
        if notify_email:
            await _notify_scheduled_run(
                db=db,
                user_id=user_id,
                agent_id=agent_id,
                run_id=run_id,
                spec=spec,
                notify_email=str(notify_email),
                result=result,
            )
        return result

    if run_type == "ingestion":
        from agent_service.knowledge.ingest import (
            ingest_storage_source,
            ingest_text_source,
            ingest_url_source,
        )

        payload = run.get("input") or {}
        source_id = payload.get("source_id")
        if payload.get("url"):
            await ingest_url_source(
                user_id=user_id,
                agent_id=agent_id,
                source_id=source_id,
                url=payload["url"],
            )
        elif payload.get("storage_path"):
            await ingest_storage_source(
                user_id=user_id,
                agent_id=agent_id,
                source_id=source_id,
                storage_path=payload["storage_path"],
                filename=payload.get("filename") or "document.txt",
                mime_type=payload.get("mime_type"),
            )
        else:
            await ingest_text_source(
                user_id=user_id,
                agent_id=agent_id,
                source_id=source_id,
                text=payload.get("text") or "",
            )
        await db.complete_run(run_id)
        return {"status": "completed", "run_id": run_id}

    return {"status": "ignored", "run_id": run_id}


def _agent_name(spec: Any) -> str:
    try:
        if isinstance(spec, dict):
            ident = spec.get("identity") or {}
            return str(ident.get("name") or "Your agent")
        return str(getattr(getattr(spec, "identity", None), "name", None) or "Your agent")
    except Exception:  # noqa: BLE001
        return "Your agent"


async def _notify_scheduled_run(
    *,
    db: Persistence,
    user_id: str,
    agent_id: str,
    run_id: str,
    spec: Any,
    notify_email: str,
    result: dict[str, Any],
) -> None:
    """Send the terminal scheduled-run email and audit the delivery. Never raises."""
    from agent_service.notifications.mailer import get_email_service

    status = "failed" if (result or {}).get("error") else "succeeded"
    summary = str((result or {}).get("answer") or (result or {}).get("error") or "")
    try:
        outcome = await get_email_service().send_scheduled_run_notification(
            to_email=notify_email,
            agent_name=_agent_name(spec),
            run_id=run_id,
            status=status,
            summary=summary or None,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("scheduled email raised err=%s", type(exc).__name__)
        outcome = None

    try:
        async with get_supabase_admin_client() as client:
            await client.post(
                "/email_deliveries",
                json={
                    "user_id": user_id,
                    "agent_id": agent_id,
                    "run_id": run_id,
                    "to_email": notify_email,
                    "subject": f"[Stack32] scheduled run {status}",
                    "status": getattr(outcome, "status", "failed"),
                    "detail": getattr(outcome, "detail", "notification error"),
                },
            )
    except Exception:  # noqa: BLE001
        logger.debug("email_deliveries audit failed", exc_info=True)


async def poll_and_process_once(owner: str | None = None) -> dict[str, Any] | None:
    owner = owner or f"worker-{uuid.uuid4().hex[:8]}"
    async with get_supabase_admin_client() as client:
        response = await client.post(
            "/rpc/lease_run_queue_job",
            json={"p_owner": owner, "p_lease_seconds": 180},
        )
    if response.status_code >= 400:
        return None
    job = response.json()
    if not job:
        return None
    run_id = job.get("run_id")
    if not run_id:
        return None
    try:
        result = await process_run_by_id(run_id)
        async with get_supabase_admin_client() as client:
            await client.patch(
                "/run_queue",
                params={"id": f"eq.{job['id']}"},
                json={"status": "completed"},
            )
        return result
    except Exception as exc:  # noqa: BLE001
        logger.exception("queue job failed")
        async with get_supabase_admin_client() as client:
            await client.patch(
                "/run_queue",
                params={"id": f"eq.{job['id']}"},
                json={
                    "status": "pending" if job.get("attempts", 0) < 3 else "dead",
                    "last_error": type(exc).__name__,
                },
            )
        return {"error": type(exc).__name__}
