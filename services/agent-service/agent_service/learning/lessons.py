"""Persist and reuse Builder repair lessons (platform-wide learning memory)."""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Any

from agent_service.supabase_client import get_supabase_admin_client

logger = logging.getLogger(__name__)


def normalize_error_signature(*, error_code: str | None, reason: str) -> str:
    """Stable fingerprint for grouping similar failures (no PII)."""
    code = (error_code or "").strip().upper()
    text = (reason or "").strip().lower()
    text = re.sub(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "<uuid>", text)
    text = re.sub(r"\b[\w.+-]+@[\w.-]+\.\w+\b", "<email>", text)
    text = re.sub(r"https?://\S+", "<url>", text)
    text = re.sub(r"\s+", " ", text)[:400]
    raw = f"{code}|{text}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


async def record_error_observation(
    *,
    error_code: str | None,
    reason: str,
    context: dict[str, Any] | None = None,
) -> None:
    """Record that an error was seen (even if not yet fixed). Platform-wide."""
    signature = normalize_error_signature(error_code=error_code, reason=reason)
    if not reason and not error_code:
        return
    try:
        async with get_supabase_admin_client() as client:
            existing = await client.get(
                "/builder_error_lessons",
                params={
                    "error_signature": f"eq.{signature}",
                    "select": "id,times_seen,times_helped,resolution_summary",
                    "limit": "1",
                },
            )
            rows = existing.json() if existing.status_code < 400 else []
            if isinstance(rows, list) and rows:
                row = rows[0]
                from datetime import datetime, timezone

                await client.patch(
                    "/builder_error_lessons",
                    params={"id": f"eq.{row['id']}"},
                    json={
                        "times_seen": int(row.get("times_seen") or 1) + 1,
                        "context": context or {},
                        "reason": (reason or "")[:2000],
                        "error_code": error_code,
                        "last_seen_at": datetime.now(timezone.utc).isoformat(),
                    },
                    headers={"Prefer": "return=minimal"},
                )
            else:
                await client.post(
                    "/builder_error_lessons",
                    json={
                        "error_signature": signature,
                        "error_code": error_code,
                        "reason": (reason or "")[:2000],
                        "context": context or {},
                        "resolution": {},
                        "resolution_summary": "",
                        "times_seen": 1,
                        "times_helped": 0,
                    },
                    headers={"Prefer": "return=minimal"},
                )
    except Exception:  # noqa: BLE001
        logger.exception("record_error_observation_failed")


async def record_repair_lesson(
    *,
    error_code: str | None,
    reason: str,
    context: dict[str, Any] | None = None,
    resolution: dict[str, Any] | None = None,
    resolution_summary: str = "",
) -> None:
    """Upsert a lesson when a repair succeeds (or a useful fix is applied)."""
    signature = normalize_error_signature(error_code=error_code, reason=reason)
    if not reason and not error_code:
        return
    try:
        async with get_supabase_admin_client() as client:
            existing = await client.get(
                "/builder_error_lessons",
                params={
                    "error_signature": f"eq.{signature}",
                    "select": "id,times_seen,times_helped",
                    "limit": "1",
                },
            )
            rows = existing.json() if existing.status_code < 400 else []
            if isinstance(rows, list) and rows:
                row = rows[0]
                await client.patch(
                    "/builder_error_lessons",
                    params={"id": f"eq.{row['id']}"},
                    json={
                        "times_seen": int(row.get("times_seen") or 1) + 1,
                        "times_helped": int(row.get("times_helped") or 0) + 1,
                        "context": context or {},
                        "resolution": resolution or {},
                        "resolution_summary": (resolution_summary or "")[:2000],
                        "reason": (reason or "")[:2000],
                        "error_code": error_code,
                    },
                    headers={"Prefer": "return=minimal"},
                )
            else:
                await client.post(
                    "/builder_error_lessons",
                    json={
                        "error_signature": signature,
                        "error_code": error_code,
                        "reason": (reason or "")[:2000],
                        "context": context or {},
                        "resolution": resolution or {},
                        "resolution_summary": (resolution_summary or "")[:2000],
                        "times_seen": 1,
                        "times_helped": 1,
                    },
                    headers={"Prefer": "return=minimal"},
                )
    except Exception:  # noqa: BLE001
        logger.exception("record_repair_lesson_failed")


async def fetch_relevant_lessons(
    *,
    error_code: str | None = None,
    reason: str = "",
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Load recent / matching lessons for prompt injection."""
    try:
        async with get_supabase_admin_client() as client:
            params: dict[str, str] = {
                "select": "error_code,reason,resolution_summary,resolution,times_helped,times_seen,last_seen_at",
                "order": "times_helped.desc,last_seen_at.desc",
                "limit": str(max(1, min(limit, 12))),
            }
            if error_code:
                params["error_code"] = f"eq.{error_code}"
            response = await client.get("/builder_error_lessons", params=params)
            if response.status_code >= 400:
                return []
            rows = response.json() or []
            if rows:
                return rows
            # Fallback: latest lessons regardless of code.
            response = await client.get(
                "/builder_error_lessons",
                params={
                    "select": "error_code,reason,resolution_summary,resolution,times_helped,times_seen,last_seen_at",
                    "order": "last_seen_at.desc",
                    "limit": str(max(1, min(limit, 12))),
                },
            )
            if response.status_code >= 400:
                return []
            return response.json() or []
    except Exception:  # noqa: BLE001
        logger.exception("fetch_relevant_lessons_failed")
        return []


def format_lessons_for_prompt(lessons: list[dict[str, Any]], *, max_chars: int = 1800) -> str:
    if not lessons:
        return ""
    lines = [
        "Past Stack32 repair lessons (apply when relevant; do not invent new failures):",
    ]
    for idx, lesson in enumerate(lessons, start=1):
        code = lesson.get("error_code") or "UNKNOWN"
        reason = (lesson.get("reason") or "")[:220]
        summary = (lesson.get("resolution_summary") or "")[:280]
        helped = lesson.get("times_helped") or 0
        seen = lesson.get("times_seen") or 0
        lines.append(f"{idx}. [{code}] seen={seen} helped={helped} — {reason}")
        if summary:
            lines.append(f"   Fix that worked: {summary}")
        else:
            lines.append("   (Seen before — avoid repeating the same failing approach.)")
    text = "\n".join(lines)
    return text[:max_chars]


# Built-in platform lessons seeded into prompts when DB is empty / cold.
PLATFORM_BOOTSTRAP_LESSONS: list[dict[str, Any]] = [
    {
        "error_code": "MODEL_PROVIDER_UNAVAILABLE",
        "reason": "Coding model id rejected (BadRequest) or all providers failed",
        "resolution_summary": (
            "Prefer openai/gpt-4.1 or gpt-4.1-mini for coding repairs; "
            "never rely solely on gpt-5.1-codex; fall back to BALANCED profile; "
            "hard-open circuit on BadRequest model ids."
        ),
        "times_helped": 10,
        "times_seen": 10,
    },
    {
        "error_code": "MODEL_BUDGET_EXCEEDED",
        "reason": "Builder run exhausted MAX_LLM_CALLS_PER_RUN during sandbox repair",
        "resolution_summary": (
            "Use a dedicated coding repair budget; avoid burning calls on dead model ids; "
            "degrade CODING→BALANCED after first provider failure."
        ),
        "times_helped": 8,
        "times_seen": 8,
    },
    {
        "error_code": "TURN_LIMIT_REACHED",
        "reason": "Sandbox coding agent hit max_turns before finishing patches",
        "resolution_summary": (
            "Prefer fewer, higher-impact patches; soft-skip TURN_LIMIT when smoke already "
            "passed; increase coding max_turns only for failed tests; avoid re-repair loops "
            "driven by empty critic scores."
        ),
        "times_helped": 6,
        "times_seen": 6,
    },
    {
        "error_code": "SANDBOX_TESTS_FAILED",
        "reason": "Scaffold pytest failed in sandbox",
        "resolution_summary": (
            "Re-run tests after each patch; fix imports and AgentSpec JSON first; "
            "keep graph.json linear and tools.json aligned with available builtins."
        ),
        "times_helped": 5,
        "times_seen": 5,
    },
]


async def lessons_for_repair(
    *,
    error_code: str | None,
    reason: str = "",
    limit: int = 5,
) -> list[dict[str, Any]]:
    """DB lessons plus bootstrap tips for the same error family."""
    rows = await fetch_relevant_lessons(error_code=error_code, reason=reason, limit=limit)
    code = (error_code or "").strip().upper()
    boot = [b for b in PLATFORM_BOOTSTRAP_LESSONS if not code or b["error_code"] == code]
    if not boot and not rows:
        boot = PLATFORM_BOOTSTRAP_LESSONS[:2]
    # Prefer DB rows, then bootstrap fillers not already covered.
    seen_codes = {(r.get("error_code") or "").upper() for r in rows}
    for item in boot:
        if item["error_code"] not in seen_codes:
            rows.append(item)
    return rows[: max(1, min(limit + 2, 12))]
