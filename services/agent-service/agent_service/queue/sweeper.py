"""A run that is never delivered must not spin forever.

Enqueuing succeeds the moment Cloud Tasks accepts the task; delivery happens
later and can fail on its own — a mis-signed OIDC token, a revoked invoker
binding, a paused queue. Nothing downstream noticed: the run stayed "queued",
the Build view kept its spinner, and the person watched an agent that had not
started and never would.

This sweep runs on the schedule tick. Any run still queued long after Cloud
Tasks should have delivered it is failed with a code the UI can explain, so a
delivery problem surfaces in seconds of reading instead of silence.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

logger = logging.getLogger(__name__)

#: Cloud Tasks delivers in seconds; this much lateness means it never will.
#: Generous on purpose — a queue backlog must not fail a healthy run.
DEFAULT_STUCK_AFTER_SECONDS = 600

#: Failing thousands of rows on one tick would stall it; sweep in slices.
MAX_PER_SWEEP = 25

#: Read back by the web app to explain the failure.
UNDELIVERED_CODE = "RUN_NEVER_STARTED"


async def sweep_undelivered_runs(
    *,
    db: Any,
    client: Any,
    stuck_after_seconds: int = DEFAULT_STUCK_AFTER_SECONDS,
    limit: int = MAX_PER_SWEEP,
) -> dict[str, Any]:
    """Fail runs that were queued but never picked up. Returns a small report."""
    cutoff = (datetime.now(UTC) - timedelta(seconds=stuck_after_seconds)).isoformat()
    try:
        response = await client.get(
            "/runs",
            params={
                "status": "eq.queued",
                "created_at": f"lt.{cutoff}",
                "select": "id,user_id,agent_id,created_at",
                "order": "created_at.asc",
                "limit": str(limit),
            },
        )
        rows = response.json() or []
    except Exception:  # noqa: BLE001 - a sweep must never break the tick
        logger.exception("undelivered_sweep_query_failed")
        return {"swept": 0, "error": "query_failed"}

    swept: list[str] = []
    for row in rows:
        run_id = str(row.get("id") or "")
        if not run_id:
            continue
        try:
            await db.emit_event(
                run_id,
                "run.failed",
                {
                    "mapping_key": "builder.errors.neverStarted",
                    "code": UNDELIVERED_CODE,
                    "queued_at": row.get("created_at"),
                },
            )
            await db.fail_run(run_id, UNDELIVERED_CODE)
            swept.append(run_id)
        except Exception:  # noqa: BLE001 - one bad row must not stop the rest
            logger.exception("undelivered_sweep_fail_failed run=%s", run_id)

    if swept:
        # Loud on purpose: this only fires when delivery is broken.
        logger.error(
            "undelivered_runs_swept count=%s cutoff=%s runs=%s",
            len(swept),
            cutoff,
            ",".join(swept[:10]),
        )
    return {"swept": len(swept), "run_ids": swept}
