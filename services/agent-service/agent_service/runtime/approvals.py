"""Persisted human approvals for side-effecting generated-agent tools (M-G).

When a tool in SIDE_EFFECT_TOOLS is requested without an existing approval,
the runtime creates a row in `agent_approval_requests` and interrupts the
loop. Deciding the request (approve/deny) lets the run resume with
`approved_tool_ids` injected into `execute_tool` context.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from agent_service.supabase_client import get_supabase_admin_client
from agent_service.tools.runtime import SIDE_EFFECT_TOOLS

logger = logging.getLogger(__name__)


async def create_approval_request(
    *,
    user_id: str,
    agent_id: str,
    run_id: str | None,
    thread_id: str | None,
    tool_id: str,
    action_summary: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Insert a pending approval. Returns the row or None if DB unavailable."""
    try:
        async with get_supabase_admin_client() as client:
            resp = await client.post(
                "/agent_approval_requests",
                json={
                    "user_id": user_id,
                    "agent_id": agent_id,
                    "run_id": run_id,
                    "thread_id": thread_id,
                    "tool_id": tool_id,
                    "action_summary": action_summary[:500],
                    "payload": payload or {},
                    "status": "pending",
                },
                headers={"Prefer": "return=representation"},
            )
            if resp.status_code < 400 and resp.json():
                return resp.json()[0]
            logger.warning("create_approval_request failed: %s", resp.text[:200])
    except Exception:  # noqa: BLE001
        logger.debug("create_approval_request skipped (db unavailable)")
    return None


async def list_pending_approvals(
    *, user_id: str, agent_id: str | None = None, run_id: str | None = None
) -> list[dict[str, Any]]:
    try:
        async with get_supabase_admin_client() as client:
            params: dict[str, str] = {
                "user_id": f"eq.{user_id}",
                "status": "eq.pending",
                "select": "id,agent_id,run_id,thread_id,tool_id,action_summary,payload,status,created_at",
                "order": "created_at.desc",
            }
            if agent_id:
                params["agent_id"] = f"eq.{agent_id}"
            if run_id:
                params["run_id"] = f"eq.{run_id}"
            resp = await client.get("/agent_approval_requests", params=params)
            if resp.status_code < 400:
                return resp.json() if isinstance(resp.json(), list) else []
    except Exception:  # noqa: BLE001
        pass
    return []


async def get_approval(*, user_id: str, approval_id: str) -> dict[str, Any] | None:
    try:
        async with get_supabase_admin_client() as client:
            resp = await client.get(
                "/agent_approval_requests",
                params={
                    "id": f"eq.{approval_id}",
                    "user_id": f"eq.{user_id}",
                    "select": "*",
                    "limit": "1",
                },
            )
            rows = resp.json() if resp.status_code < 400 else []
            return rows[0] if rows else None
    except Exception:  # noqa: BLE001
        return None


async def decide_approval(
    *,
    user_id: str,
    approval_id: str,
    decision: str,
) -> dict[str, Any] | None:
    """Mark an approval as approved or denied. Only pending rows can be decided."""
    if decision not in {"approved", "denied"}:
        raise ValueError("decision must be approved or denied")
    row = await get_approval(user_id=user_id, approval_id=approval_id)
    if not row:
        return None
    if row.get("status") != "pending":
        return row
    try:
        async with get_supabase_admin_client() as client:
            resp = await client.patch(
                "/agent_approval_requests",
                params={"id": f"eq.{approval_id}", "user_id": f"eq.{user_id}"},
                json={
                    "status": decision,
                    "decided_at": datetime.now(UTC).isoformat(),
                },
                headers={"Prefer": "return=representation"},
            )
            if resp.status_code < 400 and resp.json():
                return resp.json()[0]
    except Exception:  # noqa: BLE001
        logger.debug("decide_approval skipped (db unavailable)")
    return None


async def approved_tool_ids_for_run(*, user_id: str, run_id: str) -> list[str]:
    """Return tool_ids approved for this run (status=approved)."""
    try:
        async with get_supabase_admin_client() as client:
            resp = await client.get(
                "/agent_approval_requests",
                params={
                    "user_id": f"eq.{user_id}",
                    "run_id": f"eq.{run_id}",
                    "status": "eq.approved",
                    "select": "tool_id",
                },
            )
            rows = resp.json() if resp.status_code < 400 else []
            return list({r["tool_id"] for r in rows if r.get("tool_id")})
    except Exception:  # noqa: BLE001
        return []


async def denied_tool_ids_for_run(*, user_id: str, run_id: str) -> list[str]:
    """Return tool_ids denied for this run (status=denied)."""
    try:
        async with get_supabase_admin_client() as client:
            resp = await client.get(
                "/agent_approval_requests",
                params={
                    "user_id": f"eq.{user_id}",
                    "run_id": f"eq.{run_id}",
                    "status": "eq.denied",
                    "select": "tool_id",
                },
            )
            rows = resp.json() if resp.status_code < 400 else []
            return list({r["tool_id"] for r in rows if r.get("tool_id")})
    except Exception:  # noqa: BLE001
        return []


def requires_approval(tool_id: str) -> bool:
    return tool_id in SIDE_EFFECT_TOOLS


async def approved_call(*, user_id: str, run_id: str, tool_id: str,
                        call_id: str, arguments: dict[str, Any]) -> bool:
    """Consume one exact reviewed action; never turn it into a tool-wide grant."""
    async with get_supabase_admin_client() as client:
        response = await client.post("/rpc/consume_reviewed_action", json={
            "p_user_id": user_id, "p_run_id": run_id,
            "p_tool_id": tool_id, "p_call_id": call_id, "p_arguments": arguments,
        })
        response.raise_for_status()
        return response.json() is True


async def exact_draft_test_passed(db: Any, agent_id: str, spec: Any) -> bool:
    """After-test autonomy requires a passed test of this exact persisted spec."""
    from agent_service.models.agent_spec import load_agent_spec
    agents = await db._select("agents", {"id": f"eq.{agent_id}", "select": "draft_version_id", "limit": "1"})
    version_id = agents[0].get("draft_version_id") if agents else None
    if not version_id:
        return False
    versions = await db._select("agent_versions", {"id": f"eq.{version_id}", "agent_id": f"eq.{agent_id}", "select": "spec,test_status", "limit": "1"})
    if not versions or versions[0].get("test_status") not in {"passed", "passed_with_warnings"}:
        return False
    return load_agent_spec(versions[0]["spec"]).model_dump(mode="json") == spec.model_dump(mode="json")


def summarize_action(tool_id: str, arguments: dict[str, Any]) -> str:
    if tool_id == "gmail_send":
        to = str(arguments.get("to", ""))[:80]
        subject = str(arguments.get("subject", ""))[:80]
        return f"Send email to {to}" + (f" — {subject}" if subject else "")
    if tool_id == "calendar_create_event":
        summary = str(arguments.get("summary") or arguments.get("title") or "event")[:80]
        start = str(arguments.get("start") or arguments.get("start_time") or "")[:40]
        return f"Create calendar event “{summary}”" + (f" at {start}" if start else "")
    if tool_id.startswith("pd:"):
        return f"Run external action {tool_id}"
    return f"Execute {tool_id}"
