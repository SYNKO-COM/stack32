"""Due-based scheduler service (M5).

Claims due schedules atomically, fires each occurrence exactly once (idempotency via
``schedule_occurrences.occurrence_key``), enqueues a live run using the schedule's
instruction, and recomputes ``next_run_at`` from the cron + timezone.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from agent_service.scheduling.cron import CronError, compute_next_run, make_occurrence_key

logger = logging.getLogger(__name__)

DEFAULT_SCHEDULED_PROMPT = (
    "Run your scheduled task now. Use your tools and memory as configured, "
    "and produce the result you were set up to deliver."
)


def _occurrence_datetime(row: dict[str, Any], now: datetime) -> datetime:
    raw = row.get("next_run_at")
    if raw:
        try:
            dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=UTC)
            return dt.astimezone(UTC).replace(second=0, microsecond=0)
        except ValueError:
            pass
    return now.replace(second=0, microsecond=0)


async def _claim_due(client, limit: int) -> list[dict[str, Any]]:
    response = await client.post("/rpc/claim_due_schedules", json={"p_limit": limit})
    if response.status_code >= 400:
        logger.warning("claim_due_schedules failed status=%s", response.status_code)
        return []
    rows = response.json()
    return rows if isinstance(rows, list) else []


async def _reserve_occurrence(client, schedule_id: str, occurrence_key: str) -> bool:
    """Insert the occurrence row; returns False if it already exists (idempotent)."""
    response = await client.post(
        "/schedule_occurrences",
        json={"schedule_id": schedule_id, "occurrence_key": occurrence_key},
        headers={"Prefer": "return=representation"},
    )
    if response.status_code in (200, 201):
        return True
    # 409 = unique violation -> already fired this occurrence.
    return False


async def _update_next_run(client, schedule_id: str, next_run_at: datetime | None) -> None:
    payload: dict[str, Any] = {"updated_at": datetime.now(UTC).isoformat()}
    if next_run_at is not None:
        payload["next_run_at"] = next_run_at.isoformat()
    await client.patch(
        "/agent_schedules",
        params={"id": f"eq.{schedule_id}"},
        json=payload,
    )


async def run_due_schedules(*, db: Any, client: Any, limit: int = 25) -> dict[str, Any]:
    """Claim + fire all due schedules. Returns a summary dict."""
    now = datetime.now(UTC)
    claimed = await _claim_due(client, limit)
    enqueued: list[str] = []
    skipped = 0

    for row in claimed:
        schedule_id = str(row.get("id") or "")
        user_id = row.get("user_id")
        agent_id = row.get("agent_id")
        if not schedule_id or not user_id or not agent_id:
            continue

        occurrence_dt = _occurrence_datetime(row, now)
        occurrence_key = make_occurrence_key(schedule_id, occurrence_dt)

        reserved = await _reserve_occurrence(client, schedule_id, occurrence_key)
        if not reserved:
            skipped += 1
            # Still advance next_run_at so a stuck occurrence doesn't re-claim forever.
            await _advance_next_run(client, row, occurrence_dt)
            continue

        instruction = str(row.get("instruction") or "").strip() or DEFAULT_SCHEDULED_PROMPT
        run_id = str(uuid.uuid4())
        await db.create_run(
            run_id=run_id,
            user_id=user_id,
            agent_id=agent_id,
            kind="live",
            thread_id=None,
            status="queued",
            input_payload={
                "prompt": instruction,
                "schedule_id": schedule_id,
                "occurrence_key": occurrence_key,
                "triggered_at": now.isoformat(),
                "notify_email": row.get("notify_email"),
            },
        )
        await db.enqueue_run(run_id=run_id, user_id=user_id)
        await client.patch(
            "/schedule_occurrences",
            params={"occurrence_key": f"eq.{occurrence_key}"},
            json={"run_id": run_id},
        )
        await _advance_next_run(client, row, occurrence_dt)
        try:
            await db.audit(
                user_id=user_id,
                agent_id=agent_id,
                action="schedule_fire",
                resource_type="agent_schedule",
                resource_id=schedule_id,
                result="success",
                risk_level="medium",
                metadata={"run_id": run_id, "occurrence_key": occurrence_key},
            )
        except Exception:  # noqa: BLE001
            logger.debug("schedule audit failed", exc_info=True)
        enqueued.append(run_id)

    return {"enqueued": enqueued, "count": len(enqueued), "skipped": skipped}


async def _advance_next_run(client, row: dict[str, Any], occurrence_dt: datetime) -> None:
    cron = str(row.get("cron_expression") or "").strip()
    tz = str(row.get("timezone") or "UTC")
    next_run: datetime | None = None
    if cron:
        try:
            next_run = compute_next_run(cron, tz, occurrence_dt)
        except CronError:
            logger.warning("invalid cron for schedule=%s cron=%s", row.get("id"), cron)
            next_run = None
    await _update_next_run(client, str(row.get("id")), next_run)
