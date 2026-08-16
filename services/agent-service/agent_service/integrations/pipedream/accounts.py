"""Sync Pipedream connected accounts into Stack32 user_connections + bindings."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from agent_service.integrations.pipedream.client import PipedreamClient
from agent_service.supabase_client import get_supabase_admin_client

logger = logging.getLogger(__name__)


def _normalize_app_slug(value: str | None) -> str:
    return str(value or "").strip().lower().replace("-", "_").replace(" ", "_")


def _apps_equivalent(a: str | None, b: str | None) -> bool:
    na, nb = _normalize_app_slug(a), _normalize_app_slug(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    # Common Pipedream / product alias pairs
    aliases = {
        "google_calendar": {"calendar", "googlecalendar"},
        "google_docs": {"docs", "googledocs"},
        "google_sheets": {"sheets", "googlesheets"},
        "google_drive": {"drive", "googledrive"},
        "gmail": {"google_mail", "googlemail"},
        "slack_v2": {"slack"},
        "microsoft_outlook": {"outlook"},
    }
    for root, alts in aliases.items():
        group = {root, *alts}
        if na in group and nb in group:
            return True
    return False


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
    # Some apps (esp. Google product apps) briefly omit from filtered list —
    # fall back to the full account list and match by normalized slug.
    if app_id and not accounts:
        all_accounts = await client.list_accounts(external_user_id=user_id, app=None)
        accounts = [
            a
            for a in all_accounts
            if _apps_equivalent(str(a.get("app_id") or ""), app_id)
        ]
    elif app_id and accounts:
        filtered = [
            a
            for a in accounts
            if _apps_equivalent(str(a.get("app_id") or ""), app_id)
        ]
        if filtered:
            accounts = filtered

    synced: list[dict[str, Any]] = []
    now = datetime.now(UTC).isoformat()

    async with get_supabase_admin_client() as sb:
        for account in accounts:
            external_id = str(account.get("id") or "").strip()
            raw = account.get("raw") if isinstance(account.get("raw"), dict) else {}
            app_slug = _normalize_app_slug(
                str(account.get("app_id") or app_id or "")
            ) or str(account.get("app_id") or app_id or "").strip()
            if app_id and _apps_equivalent(app_slug, app_id):
                app_slug = _normalize_app_slug(app_id)
            if not external_id or not app_slug:
                continue
            label = _safe_account_label(account)
            dead = raw.get("dead") is True if isinstance(raw, dict) else False
            status = "disabled" if dead else "active"

            # ONLY match by Pipedream external account id. Never reuse another
            # app's row by email — that made Notion overwrite Google Calendar.
            existing = await sb.get(
                "/user_connections",
                params={
                    "user_id": f"eq.{user_id}",
                    "provider": "eq.pipedream",
                    "external_account_id": f"eq.{external_id}",
                    "select": "id,status,account_email,provider_metadata",
                    "limit": "1",
                },
            )
            rows = existing.json() if existing.status_code < 400 else []
            if not isinstance(rows, list):
                rows = []

            payload = {
                "user_id": user_id,
                "provider": "pipedream",
                "status": status,
                "account_email": label,
                "external_account_id": external_id,
                "provider_metadata": {
                    "app_id": app_slug,
                    "account_name": account.get("name"),
                    "healthy": account.get("healthy"),
                    "dead": dead,
                },
                "scopes": [],
                "last_validated_at": now,
                "token_expires_at": None,
            }
            conn_id = None
            if rows:
                conn_id = rows[0]["id"]
                # Refuse to retarget a row that already belongs to a different app.
                prev_meta = rows[0].get("provider_metadata") or {}
                prev_app = (
                    prev_meta.get("app_id") if isinstance(prev_meta, dict) else None
                )
                if prev_app and not _apps_equivalent(str(prev_app), app_slug):
                    logger.warning(
                        "pipedream_sync_skip_cross_app existing=%s prev=%s new=%s",
                        conn_id,
                        prev_app,
                        app_slug,
                    )
                    continue
                patched = await sb.patch(
                    "/user_connections",
                    params={"id": f"eq.{conn_id}", "user_id": f"eq.{user_id}"},
                    json={
                        "status": payload["status"],
                        "account_email": payload["account_email"],
                        "provider_metadata": payload["provider_metadata"],
                        "last_validated_at": now,
                        "external_account_id": external_id,
                    },
                    headers={"Prefer": "return=representation"},
                )
                if patched.status_code >= 400:
                    continue
            else:
                inserted = await sb.post(
                    "/user_connections",
                    json=payload,
                    headers={"Prefer": "return=representation"},
                )
                inserted_rows = inserted.json() if inserted.status_code < 400 else []
                if not isinstance(inserted_rows, list):
                    inserted_rows = []
                conn_id = inserted_rows[0]["id"] if inserted_rows else None
                if not conn_id:
                    logger.warning(
                        "pipedream_sync_insert_failed app=%s status=%s body=%s",
                        app_slug,
                        getattr(inserted, "status_code", None),
                        (getattr(inserted, "text", "") or "")[:300],
                    )
                    continue
            if not conn_id:
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
    """Resolve the exact bound Pipedream account for this agent + tool.

    Falls back to any agent-bound (then user-level) Pipedream connection for the
    same app, and auto-binds the tool so readiness/runtime stay in sync.
    Never returns a connection for a different product app.
    """
    from agent_service.connections.manager import ConnectionManager
    from agent_service.integrations.app_keys import app_key_from_tool_id

    resolved_app = app_id or app_key_from_tool_id(tool_id or "")
    if resolved_app in {"pipedream", "pd", ""}:
        resolved_app = app_id

    mgr = ConnectionManager()
    bindings = await mgr.list_bindings(user_id=user_id, agent_id=agent_id)
    connections = await mgr.list_connections(user_id=user_id)
    by_id = {str(c.get("id")): c for c in connections or []}

    def _conn_ok(conn: dict[str, Any] | None) -> bool:
        if not conn:
            return False
        if conn.get("provider") != "pipedream":
            return False
        status = str(conn.get("status") or "").lower()
        return status in {"active", "connected", "ok", "needs_reauth", ""}

    def _app_matches(conn: dict[str, Any]) -> bool:
        if not resolved_app:
            return False
        meta = conn.get("provider_metadata") or {}
        conn_app = meta.get("app_id") if isinstance(meta, dict) else None
        return _apps_equivalent(str(conn_app or ""), resolved_app)

    def _auth_payload(conn: dict[str, Any]) -> dict[str, Any] | None:
        external = conn.get("external_account_id")
        if not external:
            return None
        meta = conn.get("provider_metadata") or {}
        conn_app = meta.get("app_id") if isinstance(meta, dict) else None
        return {
            "connection_id": conn.get("id"),
            "auth_provision_id": external,
            "app_id": conn_app or resolved_app,
            "account_email": conn.get("account_email"),
        }

    async def _autobind(conn: dict[str, Any], reason: str) -> dict[str, Any] | None:
        payload = _auth_payload(conn)
        if not payload:
            return None
        try:
            await mgr.bind_connection(
                user_id=user_id,
                agent_id=agent_id,
                connection_id=str(conn.get("id")),
                tool_ids=[tool_id] if tool_id else [],
            )
        except Exception:  # noqa: BLE001
            logger.warning(
                "pipedream_autobind_failed tool=%s app=%s reason=%s",
                tool_id,
                resolved_app,
                reason,
            )
        return payload

    if not resolved_app:
        return None

    # 1) Exact tool_id on an enabled binding (must match app)
    for binding in bindings or []:
        if not binding.get("enabled", True):
            continue
        tids = binding.get("tool_ids") or []
        if tool_id not in tids and not (
            isinstance(tids, list) and any(str(t) == tool_id for t in tids)
        ):
            continue
        conn = by_id.get(str(binding.get("connection_id")))
        if not _conn_ok(conn) or not conn:
            continue
        if not _app_matches(conn):
            continue
        payload = _auth_payload(conn)
        if payload:
            return payload

    # 2) Any agent binding whose connection matches the app
    for binding in bindings or []:
        if not binding.get("enabled", True):
            continue
        conn = by_id.get(str(binding.get("connection_id")))
        if not _conn_ok(conn) or not conn:
            continue
        if not _app_matches(conn):
            continue
        return await _autobind(conn, "agent-bound app connection")

    # Do not fall back to unbound user-level accounts — that would let Agent A
    # silently use an account never bound to it.
    return None


async def load_agent_tool_config(
    *,
    user_id: str,
    agent_id: str,
    tool_id: str,
    installation_id: str | None = None,
) -> dict[str, Any]:
    async with get_supabase_admin_client() as sb:
        params: dict[str, str] = {
            "user_id": f"eq.{user_id}",
            "agent_id": f"eq.{agent_id}",
            "tool_id": f"eq.{tool_id}",
            "select": "config,status,provider_action_id,connection_id,schema_version,installation_id",
            "limit": "1",
        }
        if installation_id:
            params["installation_id"] = f"eq.{installation_id}"
        response = await sb.get("/agent_tool_configurations", params=params)
        if response.status_code >= 400:
            return {}
        rows = response.json() or []
        if not rows and installation_id:
            # Legacy owner fallback without installation_id.
            response = await sb.get(
                "/agent_tool_configurations",
                params={
                    "user_id": f"eq.{user_id}",
                    "agent_id": f"eq.{agent_id}",
                    "tool_id": f"eq.{tool_id}",
                    "installation_id": "is.null",
                    "select": "config,status,provider_action_id,connection_id,schema_version",
                    "limit": "1",
                },
            )
            rows = response.json() or [] if response.status_code < 400 else []
        if not rows:
            return {}
        cfg = rows[0].get("config")
        return dict(cfg) if isinstance(cfg, dict) else {}
