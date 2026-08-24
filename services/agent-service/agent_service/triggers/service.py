"""Deploy, listen, and ingest Pipedream event triggers for Stack32 agents."""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from agent_service.config import get_settings
from agent_service.integrations.pipedream.client import PipedreamClient, PipedreamError
from agent_service.integrations.pipedream.schema import (
    build_configured_props,
    coerce_prop_value,
    normalize_configurable_props,
)
from agent_service.triggers.signature import WebhookSignatureError, verify_webhook_signature

logger = logging.getLogger(__name__)

LISTEN_WINDOW_SECONDS = 600
DEFAULT_POLL_SECONDS = 60


class TriggerServiceError(Exception):
    def __init__(self, code: str, message: str = "", fields: list[str] | None = None) -> None:
        super().__init__(message or code)
        self.code = code
        #: Settings the trigger is still missing, by prop name. The UI labels
        #: these for the reader — a generic "check the connection and the
        #: event" told nobody that a Trello board had never been chosen.
        self.fields = list(fields or [])


def public_webhook_url(trigger_id: str) -> str:
    settings = get_settings()
    direct = (settings.AGENT_SERVICE_PUBLIC_URL or "").strip().rstrip("/")
    if direct:
        return f"{direct}/v1/webhooks/pipedream/{trigger_id}"
    origin = (settings.APP_ORIGIN or "").strip().rstrip("/")
    local = (not origin) or ("localhost" in origin) or ("127.0.0.1" in origin)
    if origin and not local:
        return f"{origin}/api/webhooks/pipedream/{trigger_id}"
    if settings.is_production or getattr(settings, "is_production_like", False):
        return (
            "https://stack32-agent-api-732339494633.europe-west1.run.app"
            f"/v1/webhooks/pipedream/{trigger_id}"
        )
    if origin:
        return f"{origin}/api/webhooks/pipedream/{trigger_id}"
    return f"http://localhost:3000/api/webhooks/pipedream/{trigger_id}"


def event_to_prompt(*, app_id: str | None, component_id: str | None, payload: Any) -> str:
    body: Any = payload
    if isinstance(payload, dict) and payload.get("event") is not None:
        body = payload.get("event")
    try:
        rendered = json.dumps(body, ensure_ascii=False, default=str)
    except TypeError:
        rendered = str(body)
    rendered = rendered[:8000]
    app = (app_id or "app").strip() or "app"
    component = (component_id or "event").strip() or "event"
    return (
        f"A {app} event just arrived ({component}). "
        "Handle this event according to your goal and tools.\n\n"
        f"Event payload:\n{rendered}"
    )


def _provider_event_id(payload: Any, raw_body: bytes) -> str:
    if isinstance(payload, dict):
        for key in ("id", "event_id", "delivery_id"):
            value = payload.get(key)
            if value:
                return str(value)[:200]
        nested = payload.get("event")
        if isinstance(nested, dict) and nested.get("id"):
            return str(nested["id"])[:200]
    return hashlib.sha256(raw_body).hexdigest()[:40]


#: Fields that change between two deliveries of the same underlying event.
_VOLATILE_EVENT_KEYS = frozenset(
    {
        "id",
        "event_id",
        "delivery_id",
        "timestamp",
        "ts",
        "received_at",
        "created_at",
        "updated_at",
        "edited_timestamp",
        "nonce",
        "webhook_id",
        "attempt",
    }
)

#: How far back a replay still counts as the same event. The replay seen live
#: landed 32 minutes after the original, so a quarter-hour would have missed
#: it. An hour is generous, and a byte-identical message from the same author
#: inside one is a repeat in every practical sense.
DUPLICATE_WINDOW_SECONDS = 3600


def _content_fingerprint(payload: Any) -> str:
    """Identify an event by what it says, not by the id it arrived under.

    Redeploying a source — which publishing an agent does — makes Pipedream
    replay recent history under fresh event ids, so id-based dedup let one
    Discord message be handled twice: two Trello cards, two Airtable rows, two
    Notion pages and two Slack posts for a single question. Hashing the payload
    minus its volatile parts catches the replay.
    """
    def strip(value: Any) -> Any:
        if isinstance(value, dict):
            return {
                k: strip(v)
                for k, v in sorted(value.items())
                if k.lower() not in _VOLATILE_EVENT_KEYS
            }
        if isinstance(value, list):
            return [strip(v) for v in value]
        return value

    try:
        canonical = json.dumps(strip(payload), sort_keys=True, default=str)
    except Exception:  # noqa: BLE001 - a fingerprint must never break ingestion
        canonical = repr(payload)
    return hashlib.sha256(canonical.encode()).hexdigest()[:40]


async def _seen_recently(client: Any, trigger_id: str, fingerprint: str) -> bool:
    """True when this trigger already handled the same content moments ago."""
    since = (datetime.now(UTC) - timedelta(seconds=DUPLICATE_WINDOW_SECONDS)).isoformat()
    try:
        response = await client.get(
            "/agent_trigger_events",
            params={
                "trigger_id": f"eq.{trigger_id}",
                "created_at": f"gte.{since}",
                "select": "payload",
                "order": "created_at.desc",
                "limit": "25",
            },
        )
    except Exception:  # noqa: BLE001 - never drop an event over a lookup failure
        logger.warning("duplicate_lookup_failed trigger=%s", trigger_id, exc_info=True)
        return False
    if response.status_code >= 400:
        return False
    for row in response.json() or []:
        if not isinstance(row, dict):
            continue
        stored = row.get("payload")
        if isinstance(stored, str):
            try:
                stored = json.loads(stored)
            except ValueError:
                continue
        if _content_fingerprint(stored) == fingerprint:
            return True
    return False


def _unwrap_pd(data: Any) -> dict[str, Any]:
    if isinstance(data, dict) and isinstance(data.get("data"), dict):
        return data["data"]
    return data if isinstance(data, dict) else {}


async def _load_trigger_row(client: Any, trigger_id: str) -> dict[str, Any] | None:
    response = await client.get(
        "/agent_triggers",
        params={"id": f"eq.{trigger_id}", "select": "*", "limit": "1"},
    )
    if response.status_code >= 400:
        return None
    rows = response.json()
    if isinstance(rows, list) and rows:
        return rows[0] if isinstance(rows[0], dict) else None
    return None


async def _list_agent_tool_rows(
    client: Any, *, user_id: str, agent_id: str
) -> list[dict[str, Any]]:
    response = await client.get(
        "/agent_triggers",
        params={
            "user_id": f"eq.{user_id}",
            "agent_id": f"eq.{agent_id}",
            "provider": "eq.pipedream",
            "select": "*",
            "order": "created_at.desc",
        },
    )
    if response.status_code >= 400:
        return []
    rows = response.json()
    return [r for r in rows if isinstance(r, dict)] if isinstance(rows, list) else []


async def configured_tool_trigger(*, user_id: str, agent_id: str) -> dict[str, Any] | None:
    """The event trigger this agent already has, straight from its own table.

    The spec is rebuilt from the capabilities the builder is carrying, so an
    interrupted turn — a form answered late, a run resumed from a fresh
    message — arrives with no memory of the trigger the user picked, and the
    rebuilt spec silently drops it. The row survives all of that, so it is the
    honest place to ask what this agent is wired to listen for.
    """
    from agent_service.supabase_client import get_supabase_admin_client

    try:
        async with get_supabase_admin_client() as client:
            rows = await _list_agent_tool_rows(client, user_id=user_id, agent_id=agent_id)
    except Exception:  # noqa: BLE001 - a spec rebuild must never fail over this
        logger.warning("tool_trigger_lookup_failed agent=%s", agent_id, exc_info=True)
        return None
    for row in rows:
        if not row.get("enabled", True) or not row.get("component_id"):
            continue
        return {
            "app_id": row.get("app_id"),
            "component_id": row.get("component_id"),
            "label": row.get("label"),
            "extra_props": row.get("extra_props") or {},
        }
    return None


async def _patch_trigger(client: Any, trigger_id: str, payload: dict[str, Any]) -> None:
    payload = {**payload, "updated_at": datetime.now(UTC).isoformat()}
    await client.patch("/agent_triggers", params={"id": f"eq.{trigger_id}"}, json=payload)


def _signing_keys_for(row: dict[str, Any]) -> list[str]:
    settings = get_settings()
    keys: list[str] = []
    row_key = str(row.get("webhook_signing_key") or "").strip()
    if row_key:
        keys.append(row_key)
    env_key = str(getattr(settings, "PIPEDREAM_WEBHOOK_SIGNING_KEY", "") or "").strip()
    if env_key and env_key not in keys:
        keys.append(env_key)
    return keys


async def _resolve_auth_provision(
    *,
    user_id: str,
    agent_id: str,
    app_id: str,
    connection_id: str | None,
) -> str | None:
    from agent_service.connections.manager import ConnectionManager
    from agent_service.integrations.pipedream.accounts import resolve_pipedream_auth_for_tool

    if connection_id:
        mgr = ConnectionManager()
        connections = await mgr.list_connections(user_id=user_id)
        match = next((c for c in connections if str(c.get("id")) == str(connection_id)), None)
        if match and match.get("external_account_id"):
            return str(match["external_account_id"])
    resolved = await resolve_pipedream_auth_for_tool(
        user_id=user_id,
        agent_id=agent_id,
        tool_id=f"pd:{app_id}",
        app_id=app_id,
    )
    if resolved and resolved.get("auth_provision_id"):
        return str(resolved["auth_provision_id"])
    return None


async def _build_configured_props(
    *,
    component_id: str,
    app_id: str,
    extra_props: dict[str, Any] | None,
    auth_provision_id: str,
    client: PipedreamClient,
) -> dict[str, Any]:
    component = await client.get_trigger_component(component_id)
    schema = normalize_configurable_props(
        component,
        tool_id=f"pd:{component_id}",
        action_id=component_id,
    )
    configured = build_configured_props(
        schema,
        auth_provision_id=auth_provision_id,
        static_config=extra_props or {},
        runtime_args={},
    )
    has_timer = any(
        str(p.raw.get("type") or "") == "$.interface.timer" or p.name == "timer"
        for p in schema.props
    )
    if has_timer and "timer" not in configured:
        configured["timer"] = {"intervalSeconds": DEFAULT_POLL_SECONDS}
    if schema.auth_prop_name and schema.auth_prop_name not in configured:
        configured[schema.auth_prop_name] = {"authProvisionId": auth_provision_id}
    elif app_id and app_id not in configured and not schema.auth_prop_name:
        configured[app_id] = {"authProvisionId": auth_provision_id}
    by_name = {p.name: p for p in schema.props}
    for key, value in (extra_props or {}).items():
        if key not in configured and key not in {"authProvisionId", "auth_provision_id"}:
            prop = by_name.get(key)
            configured[key] = coerce_prop_value(prop, value) if prop else value
    return configured


async def _missing_required_static(
    *,
    component_id: str,
    extra_props: dict[str, Any] | None,
    client: PipedreamClient,
) -> list[str]:
    component = await client.get_trigger_component(component_id)
    schema = normalize_configurable_props(
        component,
        tool_id=f"pd:{component_id}",
        action_id=component_id,
    )
    extras = extra_props or {}
    missing: list[str] = []
    for prop in schema.props:
        if prop.kind != "static" or not prop.required:
            continue
        value = extras.get(prop.name)
        empty = (
            value is None
            or value == ""
            or value == []
            or value == {}
        )
        if empty:
            missing.append(prop.label or prop.name)
    return missing


async def _deploy_source(
    *,
    user_id: str,
    trigger_row: dict[str, Any],
    extra_props: dict[str, Any] | None,
    connection_id: str | None,
    pd: PipedreamClient | None = None,
) -> dict[str, Any]:
    pd = pd or PipedreamClient()
    component_id = str(trigger_row.get("component_id") or "").strip()
    app_id = str(trigger_row.get("app_id") or "").strip()
    if not component_id:
        raise TriggerServiceError("TRIGGER_NOT_CONFIGURED", "Choose an event first.")
    auth_id = await _resolve_auth_provision(
        user_id=user_id,
        agent_id=str(trigger_row.get("agent_id")),
        app_id=app_id,
        connection_id=connection_id,
    )
    if not auth_id:
        raise TriggerServiceError(
            "CONNECTION_REQUIRED",
            "Connect the app to listen for events.",
            fields=[app_id] if app_id else [],
        )
    missing = await _missing_required_static(
        component_id=component_id,
        extra_props=extra_props,
        client=pd,
    )
    if missing:
        raise TriggerServiceError(
            "CONFIG_REQUIRED",
            "Configure required fields: " + ", ".join(missing[:6]),
            fields=missing,
        )
    configured = await _build_configured_props(
        component_id=component_id,
        app_id=app_id,
        extra_props=extra_props,
        auth_provision_id=auth_id,
        client=pd,
    )
    webhook_url = public_webhook_url(str(trigger_row["id"]))
    try:
        deployed = await pd.deploy_trigger(
            external_user_id=user_id,
            trigger_id=component_id,
            configured_props=configured,
            webhook_url=webhook_url,
            emit_on_deploy=False,
        )
    except PipedreamError as exc:
        logger.warning("pipedream_deploy_trigger_failed err=%s", exc)
        raise TriggerServiceError(
            "DEPLOY_FAILED",
            str(exc) or "Pipedream deploy failed.",
        ) from exc
    inner = _unwrap_pd(deployed)
    source_id = str(inner.get("id") or deployed.get("id") or "")
    webhook_meta = inner.get("webhook") if isinstance(inner.get("webhook"), dict) else {}
    # Pipedream names it `webhook_signing_key` on the deploy response. Looking
    # only for `signing_key` meant no key was ever stored, so every delivery
    # failed its signature check and the endpoint answered 401 — a tool trigger
    # could fire perfectly and still never reach the agent.
    signing_key = str(
        inner.get("webhook_signing_key")
        or deployed.get("webhook_signing_key")
        or webhook_meta.get("webhook_signing_key")
        or inner.get("signing_key")
        or deployed.get("signing_key")
        or webhook_meta.get("signing_key")
        or ""
    )
    if not source_id:
        raise TriggerServiceError("DEPLOY_FAILED", "Pipedream did not return a trigger id.")
    return {"deployed_source_id": source_id, "webhook_signing_key": signing_key or None}


async def _delete_source(*, user_id: str, deployed_source_id: str | None) -> None:
    if not deployed_source_id:
        return
    pd = PipedreamClient()
    try:
        await pd.delete_deployed_trigger(
            deployed_id=deployed_source_id, external_user_id=user_id
        )
    except PipedreamError:
        logger.warning("pipedream_delete_trigger_failed id=%s", deployed_source_id)


async def sync_tool_trigger_row(
    *,
    user_id: str,
    agent_id: str,
    enabled: bool,
    app_id: str | None,
    component_id: str | None,
    extra_props: dict[str, Any] | None,
    connection_id: str | None,
    installation_id: str | None = None,
    client: Any,
) -> dict[str, Any] | None:
    rows = await _list_agent_tool_rows(client, user_id=user_id, agent_id=agent_id)
    primary = next(
        (
            r
            for r in rows
            if component_id and str(r.get("component_id") or "") == component_id
        ),
        rows[0] if rows else None,
    )

    if not enabled:
        for row in rows:
            await _delete_source(
                user_id=user_id, deployed_source_id=row.get("deployed_source_id")
            )
            await _patch_trigger(
                client,
                str(row["id"]),
                {
                    "enabled": False,
                    "status": "disabled",
                    "mode": "listen",
                    "listening_until": None,
                    "deployed_source_id": None,
                },
            )
        return None

    if not component_id:
        payload = {
            "provider": "pipedream",
            "trigger_type": app_id or "tool",
            "component_id": None,
            "app_id": app_id,
            "enabled": True,
            "status": "idle",
            "mode": "listen",
            "config": {
                "source": "structure_tool_trigger",
                "extra_props": extra_props or {},
                "connection_id": connection_id,
            },
            "installation_id": installation_id,
        }
        if primary:
            await _patch_trigger(client, str(primary["id"]), payload)
            primary.update(payload)
            return primary
        new_id = str(uuid.uuid4())
        insert = {"id": new_id, "user_id": user_id, "agent_id": agent_id, **payload}
        response = await client.post(
            "/agent_triggers",
            json=insert,
            headers={"Prefer": "return=representation"},
        )
        if response.status_code >= 400:
            raise TriggerServiceError("TRIGGER_SAVE_FAILED")
        body = response.json()
        if isinstance(body, list) and body:
            return body[0]
        return insert if not isinstance(body, dict) else body

    config = {
        "source": "structure_tool_trigger",
        "extra_props": extra_props or {},
        "connection_id": connection_id,
    }
    payload = {
        "provider": "pipedream",
        "trigger_type": component_id,
        "component_id": component_id,
        "app_id": app_id,
        "enabled": True,
        "status": "idle",
        "mode": "listen",
        "config": config,
        "installation_id": installation_id,
        "last_error": None,
    }
    if primary:
        await _patch_trigger(client, str(primary["id"]), payload)
        primary.update(payload)
        return primary

    new_id = str(uuid.uuid4())
    insert = {
        "id": new_id,
        "user_id": user_id,
        "agent_id": agent_id,
        **payload,
    }
    response = await client.post(
        "/agent_triggers",
        json=insert,
        headers={"Prefer": "return=representation"},
    )
    if response.status_code >= 400:
        logger.warning("agent_triggers_insert_failed status=%s", response.status_code)
        raise TriggerServiceError("TRIGGER_SAVE_FAILED")
    body = response.json()
    if isinstance(body, list) and body:
        return body[0]
    if isinstance(body, dict):
        return body
    return insert


async def listen_tool_trigger(
    *,
    user_id: str,
    agent_id: str,
    published: bool,
    client: Any,
    extra_props: dict[str, Any] | None = None,
    connection_id: str | None = None,
) -> dict[str, Any]:
    rows = await _list_agent_tool_rows(client, user_id=user_id, agent_id=agent_id)
    row = next((r for r in rows if r.get("enabled") is not False and r.get("component_id")), None)
    if not row:
        raise TriggerServiceError("TRIGGER_NOT_CONFIGURED", "Configure a tool event first.")

    if published:
        return await upsert_persistent_tool_trigger(
            user_id=user_id,
            agent_id=agent_id,
            client=client,
            extra_props=extra_props or (row.get("config") or {}).get("extra_props"),
            connection_id=connection_id or (row.get("config") or {}).get("connection_id"),
        )

    cfg = row.get("config") if isinstance(row.get("config"), dict) else {}
    deployed = await _deploy_source(
        user_id=user_id,
        trigger_row=row,
        extra_props=extra_props if extra_props is not None else cfg.get("extra_props"),
        connection_id=connection_id or cfg.get("connection_id"),
    )
    until = datetime.now(UTC) + timedelta(seconds=LISTEN_WINDOW_SECONDS)
    patch = {
        "enabled": True,
        "mode": "listen",
        "status": "listening",
        "listening_until": until.isoformat(),
        "deployed_source_id": deployed["deployed_source_id"],
        "last_error": None,
    }
    if deployed.get("webhook_signing_key"):
        patch["webhook_signing_key"] = deployed["webhook_signing_key"]
    await _patch_trigger(client, str(row["id"]), patch)
    return {
        "id": row["id"],
        "status": "listening",
        "mode": "listen",
        "listening_until": until.isoformat(),
        "window_seconds": LISTEN_WINDOW_SECONDS,
    }


async def upsert_persistent_tool_trigger(
    *,
    user_id: str,
    agent_id: str,
    client: Any,
    extra_props: dict[str, Any] | None = None,
    connection_id: str | None = None,
) -> dict[str, Any]:
    rows = await _list_agent_tool_rows(client, user_id=user_id, agent_id=agent_id)
    row = next((r for r in rows if r.get("component_id")), None)
    if not row:
        raise TriggerServiceError("TRIGGER_NOT_CONFIGURED")
    cfg = row.get("config") if isinstance(row.get("config"), dict) else {}
    deployed = await _deploy_source(
        user_id=user_id,
        trigger_row=row,
        extra_props=extra_props if extra_props is not None else cfg.get("extra_props"),
        connection_id=connection_id or cfg.get("connection_id"),
    )
    patch = {
        "enabled": True,
        "mode": "persistent",
        "status": "active",
        "listening_until": None,
        "deployed_source_id": deployed["deployed_source_id"],
        "last_error": None,
    }
    if deployed.get("webhook_signing_key"):
        patch["webhook_signing_key"] = deployed["webhook_signing_key"]
    await _patch_trigger(client, str(row["id"]), patch)
    return {
        "id": row["id"],
        "status": "active",
        "mode": "persistent",
        "listening_until": None,
    }


async def teardown_tool_triggers(*, user_id: str, agent_id: str, client: Any) -> None:
    rows = await _list_agent_tool_rows(client, user_id=user_id, agent_id=agent_id)
    for row in rows:
        await _delete_source(user_id=user_id, deployed_source_id=row.get("deployed_source_id"))
        await _patch_trigger(
            client,
            str(row["id"]),
            {
                "status": "idle",
                "mode": "listen",
                "listening_until": None,
                "deployed_source_id": None,
            },
        )


async def stop_tool_trigger_listen(
    *,
    user_id: str,
    agent_id: str,
    client: Any,
) -> dict[str, Any]:
    """Stop draft listening without disabling the saved trigger config."""
    rows = await _list_agent_tool_rows(client, user_id=user_id, agent_id=agent_id)
    stopped = False
    for row in rows:
        mode = str(row.get("mode") or "")
        status = str(row.get("status") or "")
        # Do not tear down a published persistent deploy from the Structure stop button.
        if mode == "persistent" and status == "active":
            continue
        await _delete_source(user_id=user_id, deployed_source_id=row.get("deployed_source_id"))
        await _patch_trigger(
            client,
            str(row["id"]),
            {
                "status": "idle",
                "mode": "listen",
                "listening_until": None,
                "deployed_source_id": None,
                "last_error": None,
            },
        )
        stopped = True
    return {"status": "idle", "stopped": stopped}


async def runtime_status(*, user_id: str, agent_id: str, client: Any) -> dict[str, Any]:
    rows = await _list_agent_tool_rows(client, user_id=user_id, agent_id=agent_id)
    row = next((r for r in rows if r.get("component_id")), None)
    if not row:
        return {"configured": False, "status": "idle", "mode": "listen"}
    until = row.get("listening_until")
    status = str(row.get("status") or "idle")
    if status == "listening" and until:
        try:
            dt = datetime.fromisoformat(str(until).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=UTC)
            if dt < datetime.now(UTC):
                status = "idle"
        except ValueError:
            pass
    return {
        "configured": True,
        "id": row.get("id"),
        "status": status,
        "mode": row.get("mode") or "listen",
        "app_id": row.get("app_id"),
        "component_id": row.get("component_id"),
        "listening_until": row.get("listening_until"),
        "last_event_at": row.get("last_event_at"),
        "last_error": row.get("last_error"),
    }


async def ingest_pipedream_event(
    *,
    trigger_id: str,
    raw_body: bytes,
    signature_header: str | None,
    payload: Any,
    db: Any,
    client: Any,
) -> dict[str, Any]:
    row = await _load_trigger_row(client, trigger_id)
    if not row:
        return {"accepted": False, "code": "not_found"}

    keys = _signing_keys_for(row)
    settings = get_settings()
    if keys:
        last_error: WebhookSignatureError | None = None
        for key in keys:
            try:
                verify_webhook_signature(
                    signing_key=key,
                    signature_header=signature_header or "",
                    raw_body=raw_body,
                )
                last_error = None
                break
            except WebhookSignatureError as exc:
                last_error = exc
        if last_error is not None:
            return {"accepted": False, "code": last_error.code}
    elif settings.is_production or getattr(settings, "is_production_like", False):
        return {"accepted": False, "code": "INVALID_SIGNATURE"}

    status = str(row.get("status") or "idle")
    mode = str(row.get("mode") or "listen")
    now = datetime.now(UTC)
    if status not in {"listening", "active"}:
        return {"accepted": False, "code": "not_listening"}
    if mode == "listen":
        until_raw = row.get("listening_until")
        until: datetime | None = None
        if until_raw:
            try:
                until = datetime.fromisoformat(str(until_raw).replace("Z", "+00:00"))
                if until.tzinfo is None:
                    until = until.replace(tzinfo=UTC)
            except ValueError:
                until = None
        if until is None or until < now:
            await _delete_source(
                user_id=str(row.get("user_id")),
                deployed_source_id=row.get("deployed_source_id"),
            )
            await _patch_trigger(
                client,
                trigger_id,
                {"status": "idle", "listening_until": None, "deployed_source_id": None},
            )
            return {"accepted": False, "code": "listen_expired"}

    event_id = _provider_event_id(payload, raw_body)

    # Publishing an agent redeploys its source, and Pipedream then replays
    # recent history under fresh ids — so id-based dedup let one Discord
    # message be handled twice, with two of everything it creates.
    fingerprint = _content_fingerprint(payload)
    if await _seen_recently(client, trigger_id, fingerprint):
        logger.info("trigger_event_replayed trigger=%s event=%s", trigger_id, event_id)
        return {"accepted": True, "duplicate": True, "code": "replayed"}

    insert = await client.post(
        "/agent_trigger_events",
        json={
            "trigger_id": trigger_id,
            "provider_event_id": event_id,
            "payload": payload if isinstance(payload, dict) else {"raw": payload},
        },
        headers={"Prefer": "return=representation"},
    )
    insert_text = (getattr(insert, "text", "") or "").lower()
    if insert.status_code in {409, 23505} or (
        insert.status_code >= 400 and "duplicate" in insert_text
    ):
        return {"accepted": True, "duplicate": True, "code": "duplicate"}
    if insert.status_code >= 400:
        logger.warning("trigger_event_insert_failed status=%s", insert.status_code)
        return {"accepted": False, "code": "persist_failed"}

    user_id = str(row.get("user_id"))
    agent_id = str(row.get("agent_id"))
    from agent_service.installations.service import get_or_create_installation

    installation = await get_or_create_installation(user_id=user_id, agent_id=agent_id)
    installation_id = (installation or {}).get("id") if isinstance(installation, dict) else None

    prompt = event_to_prompt(
        app_id=row.get("app_id"),
        component_id=row.get("component_id"),
        payload=payload,
    )
    run_id = str(uuid.uuid4())
    await db.create_run(
        run_id=run_id,
        user_id=user_id,
        agent_id=agent_id,
        kind="live",
        thread_id=None,
        status="queued",
        input_payload={
            "prompt": prompt,
            "trigger_kind": "tool",
            "trigger_id": trigger_id,
            "pipedream_event_id": event_id,
            "triggered_at": now.isoformat(),
            "installation_id": installation_id,
            "app_id": row.get("app_id"),
            "component_id": row.get("component_id"),
        },
        installation_id=str(installation_id) if installation_id else None,
    )
    from agent_service.queue.dispatch import enqueue_run

    await enqueue_run(db=db, run_id=run_id, user_id=user_id)

    event_row = insert.json()
    event_uuid = None
    if isinstance(event_row, list) and event_row:
        event_uuid = event_row[0].get("id")
    elif isinstance(event_row, dict):
        event_uuid = event_row.get("id")
    if event_uuid:
        await client.patch(
            "/agent_trigger_events",
            params={"id": f"eq.{event_uuid}"},
            json={"run_id": run_id},
        )

    patch: dict[str, Any] = {"last_event_at": now.isoformat(), "last_error": None}
    if mode == "listen":
        await _delete_source(user_id=user_id, deployed_source_id=row.get("deployed_source_id"))
        patch.update(
            {"status": "idle", "listening_until": None, "deployed_source_id": None}
        )
    await _patch_trigger(client, trigger_id, patch)
    return {"accepted": True, "run_id": run_id, "duplicate": False}
