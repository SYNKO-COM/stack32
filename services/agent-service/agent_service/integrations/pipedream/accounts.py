"""Sync Pipedream connected accounts into Stack32 user_connections + bindings."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from agent_service.integrations.pipedream.client import PipedreamClient
from agent_service.supabase_client import get_supabase_admin_client

logger = logging.getLogger(__name__)


def _safe_account_label(account: dict[str, Any]) -> str | None:
    raw = account.get("raw") if isinstance(account.get("raw"), dict) else account
    meta = raw.get("metadata") if isinstance(raw.get("metadata"), dict) else {}
    return (
        account.get("email")
        or meta.get("email")
        or meta.get("name")
        or account.get("name")
        or None
    )


async def sync_pipedream_accounts(
    *,
    user_id: str,
    app_id: str | None = None,
) -> list[dict[str, Any]]:
    """List Pipedream accounts for the Stack32 user and upsert user_connections rows."""
    client = PipedreamClient()
    accounts = await client.list_accounts(external_user_id=user_id, app=app_id)
    synced: list[dict[str, Any]] = []
    now = datetime.now(UTC).isoformat()

    async with get_supabase_admin_client() as sb:
        for account in accounts:
            external_id = str(account.get("id") or "").strip()
            app_slug = str(account.get("app_id") or app_id or "").strip()
            if not external_id or not app_slug:
                continue
            label = _safe_account_label(account)
            existing = await sb.get(
                "/user_connections",
                params={
                    "user_id": f"eq.{user_id}",
                    "provider": "eq.pipedream",
                    "external_account_id": f"eq.{external_id}",
                    "select": "id,status",
                    "limit": "1",
                },
            )
            rows = existing.json() if existing.status_code < 400 else []
            payload = {
                "user_id": user_id,
                "provider": "pipedream",
                # Schema allows pending|active|error|revoked|disabled (no needs_reauth).
                "status": "active" if account.get("healthy") is not False else "error",
                "account_email": label,
                "external_account_id": external_id,
                "provider_metadata": {
                    "app_id": app_slug,
                    "account_name": account.get("name"),
                    "healthy": account.get("healthy"),
                },
                "scopes": [],
                "last_validated_at": now,
                "token_expires_at": None,
            }
            if rows:
                conn_id = rows[0]["id"]
                await sb.patch(
                    "/user_connections",
                    params={"id": f"eq.{conn_id}", "user_id": f"eq.{user_id}"},
                    json={
                        "status": payload["status"],
                        "account_email": payload["account_email"],
                        "provider_metadata": payload["provider_metadata"],
                        "last_validated_at": now,
                        "external_account_id": external_id,
                    },
                )
            else:
                inserted = await sb.post(
                    "/user_connections",
                    json=payload,
                    headers={"Prefer": "return=representation"},
                )
                inserted_rows = inserted.json() if inserted.status_code < 400 else []
                conn_id = inserted_rows[0]["id"] if inserted_rows else None
                if not conn_id:
                    logger.warning(
                        "pipedream_sync_insert_failed app=%s status=%s body=%s",
                        app_slug,
                        getattr(inserted, "status_code", None),
                        (getattr(inserted, "text", "") or "")[:300],
                    )
                    continue
            synced.append(
                {
                    "connection_id": conn_id,
                    "provider": "pipedream",
                    "app_id": app_slug,
                    "external_account_id": external_id,
                    "account_email": label,
                    "status": payload["status"],
                }
            )
    return synced


async def resolve_pipedream_auth_for_tool(
    *,
    user_id: str,
    agent_id: str,
    tool_id: str,
    app_id: str | None = None,
) -> dict[str, Any] | None:
    """Resolve the exact bound Pipedream account for this agent + tool."""
    from agent_service.connections.manager import ConnectionManager

    mgr = ConnectionManager()
    bindings = await mgr.list_bindings(user_id=user_id, agent_id=agent_id)
    tool_ids_match = []
    for binding in bindings or []:
        if not binding.get("enabled", True):
            continue
        tids = binding.get("tool_ids") or []
        if tool_id in tids or (isinstance(tids, list) and any(str(t) == tool_id for t in tids)):
            tool_ids_match.append(binding)
        elif not tids and app_id:
            # Binding without tool_ids — accept if connection app matches
            tool_ids_match.append(binding)

    connections = await mgr.list_connections(user_id=user_id)
    by_id = {str(c.get("id")): c for c in connections or []}

    for binding in tool_ids_match:
        conn = by_id.get(str(binding.get("connection_id")))
        if not conn:
            continue
        if conn.get("provider") != "pipedream":
            continue
        if conn.get("status") not in {"active", "connected", None}:
            # allow active-like
            if conn.get("status") not in {"active", "needs_reauth"}:
                continue
        external = conn.get("external_account_id")
        meta = conn.get("provider_metadata") or {}
        conn_app = meta.get("app_id") if isinstance(meta, dict) else None
        if app_id and conn_app and conn_app != app_id:
            continue
        if not external:
            continue
        return {
            "connection_id": conn.get("id"),
            "auth_provision_id": external,
            "app_id": conn_app or app_id,
            "account_email": conn.get("account_email"),
        }

    # Fallback: single active pipedream connection for app (still agent-bound preferred)
    return None


async def load_agent_tool_config(
    *, user_id: str, agent_id: str, tool_id: str
) -> dict[str, Any]:
    async with get_supabase_admin_client() as sb:
        response = await sb.get(
            "/agent_tool_configurations",
            params={
                "user_id": f"eq.{user_id}",
                "agent_id": f"eq.{agent_id}",
                "tool_id": f"eq.{tool_id}",
                "select": "config,status,provider_action_id,connection_id,schema_version",
                "limit": "1",
            },
        )
        if response.status_code >= 400:
            return {}
        rows = response.json() or []
        if not rows:
            return {}
        cfg = rows[0].get("config")
        return dict(cfg) if isinstance(cfg, dict) else {}
