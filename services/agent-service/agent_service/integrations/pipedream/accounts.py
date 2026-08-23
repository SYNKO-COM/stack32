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
        "x_ai": {"xai"},
        "mistral_ai": {"mistral"},
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
    """Resolve the bound Pipedream account for this agent + tool.

    Falls back to any *agent-bound* connection for the same app, auto-binding
    the tool so readiness and runtime stay in sync. It deliberately stops
    there: an unbound user-level account is never used, or agent A could
    quietly act through an account its owner only ever connected to agent B.
    So a new agent needs the account bound to it once — one click in the tool
    drawer, no re-authorisation — and until then its tools answer
    CONNECTION_REQUIRED.

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


def _pick_tool_config_row(
    rows: list[dict[str, Any]],
    *,
    installation_id: str | None,
) -> dict[str, Any] | None:
    """Prefer installation-scoped rows with non-empty config, then most recent."""
    if not rows:
        return None

    def _score(row: dict[str, Any]) -> tuple[int, int, str]:
        cfg = row.get("config")
        filled = 1 if isinstance(cfg, dict) and any(v not in (None, "") for v in cfg.values()) else 0
        inst = row.get("installation_id")
        inst_match = 0
        if installation_id:
            inst_match = 2 if str(inst or "") == installation_id else (1 if inst is None else 0)
        elif inst is None:
            inst_match = 2
        updated = str(row.get("updated_at") or row.get("last_validated_at") or "")
        return (inst_match, filled, updated)

    return max(rows, key=_score)


def _config_from_row(row: dict[str, Any] | None) -> dict[str, Any]:
    if not row:
        return {}
    cfg = row.get("config")
    return dict(cfg) if isinstance(cfg, dict) else {}


def _select_tool_config_row(
    rows: list[dict[str, Any]],
    *,
    tool_id: str,
    installation_id: str | None,
) -> dict[str, Any] | None:
    """Exact tool_id match first, then any sibling action in the same Pipedream app."""
    from agent_service.integrations.app_keys import app_key_from_tool_id

    exact = [r for r in rows if str(r.get("tool_id") or "") == tool_id]
    picked = _pick_tool_config_row(exact, installation_id=installation_id)
    if picked:
        return picked

    target_app = app_key_from_tool_id(tool_id)
    if not target_app or target_app in {"pipedream", "pd"}:
        return None

    siblings = [
        r
        for r in rows
        if app_key_from_tool_id(str(r.get("tool_id") or "")) == target_app
    ]
    return _pick_tool_config_row(siblings, installation_id=installation_id)


async def load_agent_tool_config(
    *,
    user_id: str,
    agent_id: str,
    tool_id: str,
    installation_id: str | None = None,
) -> dict[str, Any]:
    """Load Structure static props for a tool, falling back to same-app siblings.

    Structure saves config against ``toolIds[0]`` while Live may call another
    action in the same app (e.g. add-single-row vs add-multiple-rows).
    """
    select = (
        "config,status,provider_action_id,connection_id,schema_version,"
        "installation_id,updated_at,last_validated_at,tool_id"
    )
    async with get_supabase_admin_client() as sb:
        params: dict[str, str] = {
            "user_id": f"eq.{user_id}",
            "agent_id": f"eq.{agent_id}",
            "tool_id": f"eq.{tool_id}",
            "select": select,
            "order": "updated_at.desc",
        }
        response = await sb.get("/agent_tool_configurations", params=params)
        if response.status_code >= 400:
            return {}
        rows = [r for r in (response.json() or []) if isinstance(r, dict)]
        row = _select_tool_config_row(rows, tool_id=tool_id, installation_id=installation_id)
        if row:
            return _config_from_row(row)

        from agent_service.integrations.app_keys import app_key_from_tool_id

        target_app = app_key_from_tool_id(tool_id)
        if not target_app or target_app in {"pipedream", "pd"}:
            return {}

        fallback = await sb.get(
            "/agent_tool_configurations",
            params={
                "user_id": f"eq.{user_id}",
                "agent_id": f"eq.{agent_id}",
                "select": select,
                "order": "updated_at.desc",
            },
        )
        if fallback.status_code >= 400:
            return {}
        all_rows = [r for r in (fallback.json() or []) if isinstance(r, dict)]
        row = _select_tool_config_row(all_rows, tool_id=tool_id, installation_id=installation_id)
        return _config_from_row(row)


async def upsert_agent_tool_config(
    *,
    user_id: str,
    agent_id: str,
    tool_id: str,
    config: dict[str, Any],
    connection_id: str | None = None,
    provider_action_id: str | None = None,
    schema_version: str | None = None,
) -> None:
    """Create or update Structure static props for one tool."""
    now = datetime.now(UTC).isoformat()
    payload = {
        "user_id": user_id,
        "agent_id": agent_id,
        "tool_id": tool_id,
        "connection_id": connection_id,
        "provider": "pipedream" if tool_id.startswith("pd:") else "native",
        "provider_action_id": provider_action_id or tool_id.removeprefix("pd:"),
        "config": config,
        "schema_version": schema_version,
        "status": "active",
        "last_validated_at": now,
        "updated_at": now,
    }
    async with get_supabase_admin_client() as sb:
        existing = await sb.get(
            "/agent_tool_configurations",
            params={
                "user_id": f"eq.{user_id}",
                "agent_id": f"eq.{agent_id}",
                "tool_id": f"eq.{tool_id}",
                "select": "id",
                "limit": "1",
            },
        )
        rows = existing.json() if existing.status_code < 400 else []
        if rows:
            await sb.patch(
                "/agent_tool_configurations",
                params={"id": f"eq.{rows[0]['id']}", "user_id": f"eq.{user_id}"},
                json=payload,
            )
        else:
            await sb.post("/agent_tool_configurations", json=payload)


async def replicate_tool_config_to_app_siblings(
    *,
    user_id: str,
    agent_id: str,
    source_tool_id: str,
    config: dict[str, Any],
    connection_id: str | None = None,
    schema_version: str | None = None,
) -> None:
    """Copy saved config to every enabled Pipedream tool in the same app on this agent."""
    from agent_service.integrations.app_keys import app_key_from_tool_id
    from agent_service.models.agent_spec import load_agent_spec

    target_app = app_key_from_tool_id(source_tool_id)
    if not target_app or not source_tool_id.startswith("pd:"):
        return

    async with get_supabase_admin_client() as sb:
        response = await sb.get(
            "/agents",
            params={"id": f"eq.{agent_id}", "select": "definition", "limit": "1"},
        )
        if response.status_code >= 400:
            return
        rows = response.json() or []
        if not rows:
            return
        definition = rows[0].get("definition") if isinstance(rows[0], dict) else None
        if not isinstance(definition, dict):
            return

    try:
        spec = load_agent_spec(definition)
    except Exception:  # noqa: BLE001
        logger.debug("replicate_tool_config_spec_failed agent_id=%s", agent_id, exc_info=True)
        return

    sibling_ids: list[str] = []
    for binding in spec.tools:
        if not binding.enabled:
            continue
        tid = str(binding.tool_id or "")
        if not tid.startswith("pd:") or tid == source_tool_id:
            continue
        if app_key_from_tool_id(tid) == target_app:
            sibling_ids.append(tid)

    for tid in sibling_ids:
        await upsert_agent_tool_config(
            user_id=user_id,
            agent_id=agent_id,
            tool_id=tid,
            config=dict(config),
            connection_id=connection_id,
            schema_version=schema_version,
        )
