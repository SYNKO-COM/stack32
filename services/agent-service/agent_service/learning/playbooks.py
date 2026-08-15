"""Platform-wide learned playbooks for Pipedream tool configurations.

When a Live run succeeds with a given action + static config shape, we store a
sanitized fingerprint so the next agent can pre-fill Structure tool-config UI
and Builder can inject proven field requirements.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import UTC, datetime
from typing import Any

from agent_service.supabase_client import get_supabase_admin_client

logger = logging.getLogger(__name__)

_SECRET_KEYS = {
    "auth_provision_id",
    "authprovisionid",
    "access_token",
    "refresh_token",
    "api_key",
    "apikey",
    "password",
    "secret",
    "token",
    "authorization",
}


def _is_secret_key(key: str) -> bool:
    k = key.lower().replace("-", "_")
    if k in _SECRET_KEYS:
        return True
    return any(s in k for s in ("token", "secret", "password", "credential", "apikey"))


def sanitize_config_shape(config: dict[str, Any] | None) -> dict[str, Any]:
    """Keep prop *keys* and non-sensitive value shapes — strip PII-ish values.

    Stored playbooks teach *which fields are required*, not user page/channel ids.
    """
    out: dict[str, Any] = {}
    for key, value in (config or {}).items():
        if _is_secret_key(str(key)):
            continue
        if isinstance(value, dict):
            if "authProvisionId" in value or "auth_provision_id" in value:
                continue
            nested = sanitize_config_shape(value)
            if nested:
                out[str(key)] = {"type": "object", "keys": sorted(nested.keys())}
            continue
        if isinstance(value, list):
            out[str(key)] = {"type": "array", "len_hint": min(len(value), 20)}
            continue
        if value is None or value == "":
            continue
        # Store type + short fingerprint, not the raw value (page ids, emails…).
        kind = type(value).__name__
        sample = str(value)[:48]
        if re.search(r"@|\.com|http|/|\d{6,}", sample, re.I):
            out[str(key)] = {"type": kind, "required": True}
        else:
            # Safe enums like designType=preset, name=doc
            out[str(key)] = {"type": kind, "example": sample[:64], "required": True}
    return out


def playbook_signature(*, action_id: str, app_id: str | None, shape: dict[str, Any]) -> str:
    raw = json.dumps(
        {"action": action_id, "app": app_id or "", "shape": shape},
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


async def record_tool_playbook_success(
    *,
    tool_id: str,
    action_id: str | None = None,
    app_id: str | None = None,
    static_config: dict[str, Any] | None = None,
    runtime_keys: list[str] | None = None,
    notes: str = "",
    needs_dynamic_props: bool = False,
) -> None:
    """Upsert a playbook after a successful Pipedream action run (platform-wide)."""
    action = (action_id or tool_id.removeprefix("pd:")).strip()
    if not action:
        return
    shape = sanitize_config_shape(static_config)
    if runtime_keys:
        shape["_runtime_keys"] = sorted({str(k) for k in runtime_keys if k})[:40]
    if needs_dynamic_props:
        shape["_needs_dynamic_props"] = True
    signature = playbook_signature(action_id=action, app_id=app_id, shape=shape)
    now = datetime.now(UTC).isoformat()
    try:
        async with get_supabase_admin_client() as client:
            existing = await client.get(
                "/tool_config_playbooks",
                params={
                    "signature": f"eq.{signature}",
                    "select": "id,times_succeeded,times_failed",
                    "limit": "1",
                },
            )
            rows = existing.json() if existing.status_code < 400 else []
            if isinstance(rows, list) and rows:
                row = rows[0]
                await client.patch(
                    "/tool_config_playbooks",
                    params={"id": f"eq.{row['id']}"},
                    json={
                        "times_succeeded": int(row.get("times_succeeded") or 0) + 1,
                        "config_shape": shape,
                        "notes": (notes or "")[:2000],
                        "last_succeeded_at": now,
                        "status": "stable",
                    },
                    headers={"Prefer": "return=minimal"},
                )
            else:
                await client.post(
                    "/tool_config_playbooks",
                    json={
                        "signature": signature,
                        "tool_id": tool_id[:256],
                        "action_id": action[:256],
                        "app_id": (app_id or "")[:128] or None,
                        "config_shape": shape,
                        "notes": (notes or "")[:2000],
                        "times_succeeded": 1,
                        "times_failed": 0,
                        "status": "candidate",
                        "last_succeeded_at": now,
                    },
                    headers={"Prefer": "return=minimal"},
                )
    except Exception:  # noqa: BLE001
        logger.exception("record_tool_playbook_success_failed")


async def record_tool_playbook_failure(
    *,
    tool_id: str,
    action_id: str | None = None,
    app_id: str | None = None,
    error_message: str = "",
) -> None:
    action = (action_id or tool_id.removeprefix("pd:")).strip()
    if not action:
        return
    try:
        async with get_supabase_admin_client() as client:
            response = await client.get(
                "/tool_config_playbooks",
                params={
                    "action_id": f"eq.{action}",
                    "select": "id,times_failed,times_succeeded",
                    "order": "times_succeeded.desc",
                    "limit": "3",
                },
            )
            rows = response.json() if response.status_code < 400 else []
            for row in rows or []:
                await client.patch(
                    "/tool_config_playbooks",
                    params={"id": f"eq.{row['id']}"},
                    json={
                        "times_failed": int(row.get("times_failed") or 0) + 1,
                        "notes": (error_message or "")[:2000],
                    },
                    headers={"Prefer": "return=minimal"},
                )
    except Exception:  # noqa: BLE001
        logger.exception("record_tool_playbook_failure_failed")


async def fetch_playbooks_for_tool(
    *,
    tool_id: str | None = None,
    action_id: str | None = None,
    app_id: str | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    try:
        async with get_supabase_admin_client() as client:
            params: dict[str, str] = {
                "select": (
                    "tool_id,action_id,app_id,config_shape,notes,times_succeeded,"
                    "times_failed,status,last_succeeded_at"
                ),
                "order": "times_succeeded.desc,last_succeeded_at.desc",
                "limit": str(max(1, min(limit, 12))),
                "status": "in.(stable,candidate)",
            }
            if action_id:
                params["action_id"] = f"eq.{action_id}"
            elif tool_id:
                params["tool_id"] = f"eq.{tool_id}"
            elif app_id:
                params["app_id"] = f"eq.{app_id}"
            response = await client.get("/tool_config_playbooks", params=params)
            if response.status_code >= 400:
                return []
            return response.json() or []
    except Exception:  # noqa: BLE001
        logger.exception("fetch_playbooks_for_tool_failed")
        return []


def format_playbooks_for_prompt(playbooks: list[dict[str, Any]], *, max_chars: int = 1200) -> str:
    if not playbooks:
        return ""
    lines = [
        "Learned Pipedream tool config playbooks (field shapes that previously worked):",
    ]
    for idx, pb in enumerate(playbooks, start=1):
        action = pb.get("action_id") or pb.get("tool_id")
        shape = pb.get("config_shape") or {}
        keys = [k for k in shape.keys() if not str(k).startswith("_")]
        succ = pb.get("times_succeeded") or 0
        notes = (pb.get("notes") or "")[:160]
        dyn = " +dynamic_props" if shape.get("_needs_dynamic_props") else ""
        lines.append(
            f"{idx}. {action}{dyn} succeeded={succ} fields={keys[:12]}"
            + (f" — {notes}" if notes else "")
        )
    return "\n".join(lines)[:max_chars]


# Proven shapes from Live debugging (Calendar / Canva / Notion) — used when DB empty.
BOOTSTRAP_PLAYBOOKS: list[dict[str, Any]] = [
    {
        "tool_id": "calendar_create_event",
        "action_id": "google_calendar-create-event",
        "app_id": "google_calendar",
        "config_shape": {
            "eventStartDate": {"type": "str", "required": True},
            "eventEndDate": {"type": "str", "required": True},
            "_runtime_keys": ["summary", "description", "text"],
        },
        "notes": "Auth prop googleCalendar; not start/end objects",
        "times_succeeded": 3,
        "status": "stable",
    },
    {
        "tool_id": "pd:canva-create-design",
        "action_id": "canva-create-design",
        "app_id": "canva",
        "config_shape": {
            "designType": {"type": "str", "example": "preset", "required": True},
            "name": {"type": "str", "example": "doc", "required": True},
            "_needs_dynamic_props": True,
        },
        "notes": "reloadProps then dynamic_props_id",
        "times_succeeded": 3,
        "status": "stable",
    },
    {
        "tool_id": "pd:notion",
        "action_id": "notion-create-page",
        "app_id": "notion",
        "config_shape": {
            "parentPageId": {"type": "str", "required": True},
            "pageId": {"type": "str", "required": True},
        },
        "notes": "Needs parent page/database — cannot invent blank workspace pages",
        "times_succeeded": 2,
        "status": "stable",
    },
]


async def playbooks_for_tool(
    *,
    tool_id: str | None = None,
    action_id: str | None = None,
    app_id: str | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """DB playbooks plus bootstrap fillers for the same action/app."""
    rows = await fetch_playbooks_for_tool(
        tool_id=tool_id, action_id=action_id, app_id=app_id, limit=limit
    )
    action = (action_id or (tool_id or "").removeprefix("pd:")).lower()
    app = (app_id or "").lower()
    boot = [
        b
        for b in BOOTSTRAP_PLAYBOOKS
        if (action and action in str(b.get("action_id") or "").lower())
        or (app and app == str(b.get("app_id") or "").lower())
        or (tool_id and tool_id in str(b.get("tool_id") or ""))
    ]
    seen = {(r.get("action_id") or "").lower() for r in rows}
    for item in boot:
        if str(item.get("action_id") or "").lower() not in seen:
            rows.append(item)
    return rows[: max(1, min(limit + 2, 12))]
