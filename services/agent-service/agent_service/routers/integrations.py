"""Hybrid integrations API — connect tokens, account sync, bindings, tool config."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from agent_service.auth import CurrentUser
from agent_service.connections.manager import ConnectionManager
from agent_service.integrations.pipedream.accounts import sync_pipedream_accounts
from agent_service.integrations.pipedream.client import PipedreamClient
from agent_service.integrations.registry import get_provider_registry
from agent_service.supabase_client import get_supabase_admin_client

router = APIRouter(tags=["integrations"])


class ConnectTokenRequest(BaseModel):
    """Create a Pipedream Connect token for the authenticated user only."""

    app_id: str | None = Field(default=None, max_length=128)


class SyncAccountsRequest(BaseModel):
    app_id: str | None = Field(default=None, max_length=128)
    agent_id: str | None = Field(default=None)
    tool_ids: list[str] = Field(default_factory=list)
    connection_id: str | None = None


class BindConnectionRequest(BaseModel):
    agent_id: str
    connection_id: str
    tool_ids: list[str] = Field(default_factory=list)


class ToolConfigRequest(BaseModel):
    config: dict[str, Any] = Field(default_factory=dict)
    connection_id: str | None = None
    provider_action_id: str | None = None
    schema_version: str | None = None


class ReloadPropsRequest(BaseModel):
    agent_id: str
    config: dict[str, Any] = Field(default_factory=dict)
    connection_id: str | None = None
    changed_prop: str | None = Field(default=None, max_length=128)


@router.post("/integrations/connect-token")
async def create_connect_token(
    body: ConnectTokenRequest, user: CurrentUser
) -> dict[str, Any]:
    # Never trust a client-supplied external_user_id — always the JWT subject.
    external_user_id = user.user_id
    client = PipedreamClient()
    result = await client.create_connect_token(external_user_id, app_id=body.app_id)
    return {
        "external_user_id": external_user_id,
        "app_id": body.app_id,
        "connect": result,
    }


@router.post("/integrations/accounts/sync")
async def sync_accounts(body: SyncAccountsRequest, user: CurrentUser) -> dict[str, Any]:
    from agent_service.integrations.pipedream.accounts import _apps_equivalent

    synced = await sync_pipedream_accounts(user_id=user.user_id, app_id=body.app_id)
    binding = None
    if body.agent_id and body.tool_ids:
        conn_id = body.connection_id
        if not conn_id and synced:
            match = next(
                (
                    s
                    for s in synced
                    if not body.app_id or _apps_equivalent(str(s.get("app_id") or ""), body.app_id)
                ),
                synced[0],
            )
            conn_id = match.get("connection_id")
        if conn_id:
            mgr = ConnectionManager()
            binding = await mgr.bind_connection(
                user_id=user.user_id,
                agent_id=body.agent_id,
                connection_id=str(conn_id),
                tool_ids=body.tool_ids,
            )
    return {"accounts": synced, "binding": binding}


@router.post("/integrations/bindings")
async def create_binding(body: BindConnectionRequest, user: CurrentUser) -> dict[str, Any]:
    mgr = ConnectionManager()
    binding = await mgr.bind_connection(
        user_id=user.user_id,
        agent_id=body.agent_id,
        connection_id=body.connection_id,
        tool_ids=body.tool_ids,
    )
    return {"binding": binding}


@router.get("/integrations/accounts")
async def list_integration_accounts(
    user: CurrentUser,
    app_id: str | None = Query(default=None, max_length=128),
) -> dict[str, Any]:
    mgr = ConnectionManager()
    conns = await mgr.list_connections(user_id=user.user_id)
    out = []
    for c in conns:
        if c.get("provider") not in {"pipedream", "google"}:
            continue
        meta = c.get("provider_metadata") or {}
        c_app = meta.get("app_id") if isinstance(meta, dict) else None
        if c.get("provider") == "google":
            c_app = "google"
        # Strict app filter: never leak Google accounts into Notion/Canva pickers.
        if app_id:
            from agent_service.integrations.pipedream.accounts import _apps_equivalent

            app_l = str(app_id).lower()
            c_app_l = str(c_app or "").lower()
            provider_l = str(c.get("provider") or "").lower()
            if not (
                _apps_equivalent(c_app_l, app_l)
                or provider_l == app_l
            ):
                continue
            if not c_app_l and provider_l == "pipedream":
                continue
        out.append(
            {
                "connection_id": c.get("id"),
                "provider": c.get("provider"),
                "app_id": c_app,
                "account_email": c.get("account_email") or c.get("account_label"),
                "status": c.get("status"),
                "external_account_id": c.get("external_account_id"),
            }
        )
    return {"accounts": out}


@router.get("/agents/{agent_id}/tools/{tool_id}/config")
async def get_tool_config(agent_id: str, tool_id: str, user: CurrentUser) -> dict[str, Any]:
    from agent_service.integrations.pipedream.accounts import (
        _select_tool_config_row,
        load_agent_tool_config,
    )

    row = None
    async with get_supabase_admin_client() as sb:
        response = await sb.get(
            "/agent_tool_configurations",
            params={
                "user_id": f"eq.{user.user_id}",
                "agent_id": f"eq.{agent_id}",
                "select": "*",
                "order": "updated_at.desc",
            },
        )
        rows = response.json() if response.status_code < 400 else []
        if isinstance(rows, list):
            row = _select_tool_config_row(
                [r for r in rows if isinstance(r, dict)],
                tool_id=tool_id,
                installation_id=None,
            )
    effective_config = await load_agent_tool_config(
        user_id=user.user_id,
        agent_id=agent_id,
        tool_id=tool_id,
    )
    if row and effective_config and isinstance(row.get("config"), dict):
        row = {**row, "config": effective_config}
    schema = None
    try:
        registry = get_provider_registry()
        pd = registry.get_provider("pipedream")
        if pd and tool_id.startswith("pd:"):
            schema = await pd.get_tool_schema(tool_id)
    except Exception:  # noqa: BLE001
        schema = None

    app_hint = None
    playbooks: list[dict[str, Any]] = []
    try:
        from agent_service.integrations.pipedream.knowledge import hint_for_tool
        from agent_service.learning.playbooks import playbooks_for_tool

        app_hint = hint_for_tool(tool_id)
        action_id = None
        if isinstance(schema, dict):
            action_id = schema.get("provider_tool_id") or schema.get("key")
        elif schema is not None:
            action_id = getattr(schema, "provider_tool_id", None) or getattr(
                schema, "key", None
            )
        playbooks = await playbooks_for_tool(
            tool_id=tool_id,
            action_id=str(action_id) if action_id else tool_id.removeprefix("pd:"),
            limit=5,
        )
    except Exception:  # noqa: BLE001
        app_hint = None
        playbooks = []
    return {
        "config": row,
        "schema": schema,
        "app_hint": app_hint,
        "playbooks": playbooks,
    }


@router.put("/agents/{agent_id}/tools/{tool_id}/config")
async def put_tool_config(
    agent_id: str, tool_id: str, body: ToolConfigRequest, user: CurrentUser
) -> dict[str, Any]:
    from agent_service.integrations.pipedream.accounts import (
        replicate_tool_config_to_app_siblings,
        upsert_agent_tool_config,
    )

    cleaned = {
        k: v
        for k, v in (body.config or {}).items()
        if k
        not in {
            "auth_provision_id",
            "authProvisionId",
            "access_token",
            "refresh_token",
            "api_key",
        }
    }
    await upsert_agent_tool_config(
        user_id=user.user_id,
        agent_id=agent_id,
        tool_id=tool_id,
        config=cleaned,
        connection_id=body.connection_id,
        provider_action_id=body.provider_action_id,
        schema_version=body.schema_version,
    )
    await replicate_tool_config_to_app_siblings(
        user_id=user.user_id,
        agent_id=agent_id,
        source_tool_id=tool_id,
        config=cleaned,
        connection_id=body.connection_id,
        schema_version=body.schema_version,
    )
    return {"ok": True, "config": cleaned}


@router.get("/integrations/tools/{tool_id}/options")
async def tool_dynamic_options(
    tool_id: str,
    user: CurrentUser,
    prop: str = Query(..., max_length=128),
    agent_id: str | None = Query(default=None),
) -> dict[str, Any]:
    registry = get_provider_registry()
    pd = registry.get_provider("pipedream")
    if pd is None:
        return {"options": []}
    from agent_service.integrations.normalize import ToolRef
    from agent_service.integrations.pipedream.accounts import (
        load_agent_tool_config,
        resolve_pipedream_auth_for_tool,
    )

    context: dict[str, Any] = {"user_id": user.user_id}
    if agent_id:
        auth = await resolve_pipedream_auth_for_tool(
            user_id=user.user_id, agent_id=agent_id, tool_id=tool_id
        )
        if auth:
            context["auth_provision_id"] = auth["auth_provision_id"]
        context["config"] = await load_agent_tool_config(
            user_id=user.user_id, agent_id=agent_id, tool_id=tool_id
        )
    options = await pd.get_dynamic_options(
        ToolRef(tool_id=tool_id, provider="pipedream", provider_tool_id=tool_id.removeprefix("pd:")),
        prop,
        context=context,
    )
    return {"options": options}


@router.post("/integrations/tools/{tool_id}/reload-props")
async def reload_tool_props(
    tool_id: str,
    body: ReloadPropsRequest,
    user: CurrentUser,
) -> dict[str, Any]:
    """Reload Pipedream dynamic props after a Structure reloadProps field changes."""
    from agent_service.integrations.pipedream.tool_config import reload_tool_props_for_structure

    return await reload_tool_props_for_structure(
        user_id=user.user_id,
        agent_id=body.agent_id,
        tool_id=tool_id,
        config=body.config,
        connection_id=body.connection_id,
    )


@router.get("/integrations/apps/icons")
async def lookup_integration_app_icons(
    user: CurrentUser,
    ids: str = Query(default="", max_length=800),
) -> dict[str, Any]:
    """Batch exact Pipedream img_src lookups (cached in-process)."""
    _ = user
    try:
        slugs = [s.strip().lower() for s in ids.split(",") if s.strip()][:24]
        client = PipedreamClient()
        icons = await client.icons_for_apps(slugs)
        return {"icons": icons}
    except Exception:  # noqa: BLE001
        return {"icons": {}}


@router.get("/integrations/apps/search")
async def search_integration_apps(
    user: CurrentUser,
    q: str = Query(default="", max_length=200),
    limit: int = Query(default=20, ge=1, le=50),
) -> dict[str, Any]:
    """Search the full Pipedream app catalog (3000+ apps)."""
    _ = user
    registry = get_provider_registry()
    apps = await registry.search_apps(q, limit=limit)
    return {"query": q, "apps": apps}


@router.get("/providers/health")
async def providers_health() -> dict[str, Any]:
    """Health for hybrid integration providers (+ LLM provider status)."""
    registry = get_provider_registry()
    integrations = await registry.health()
    llm: list[dict[str, Any]] = []
    try:
        from agent_service.gateway.model_gateway import provider_health

        llm = [p.model_dump() for p in provider_health()]
    except Exception:  # noqa: BLE001
        llm = []
    return {"providers": integrations, "llm": llm}


@router.get("/integrations/triggers/search")
async def search_integration_triggers(
    user: CurrentUser,
    q: str = Query(default="", max_length=200),
    app_id: str | None = Query(default=None, max_length=128),
    limit: int = Query(default=50, ge=1, le=100),
) -> dict[str, Any]:
    _ = user
    client = PipedreamClient()
    triggers = await client.search_triggers(q, app_id=app_id, limit=limit)
    return {"query": q, "app_id": app_id, "triggers": triggers}


@router.get("/integrations/triggers/{component_id}")
async def get_integration_trigger(
    component_id: str, user: CurrentUser
) -> dict[str, Any]:
    _ = user
    client = PipedreamClient()
    component = await client.get_trigger_component(component_id)
    if not component:
        return {"component_id": component_id, "found": False, "props": []}
    from agent_service.integrations.pipedream.schema import normalize_configurable_props

    schema = normalize_configurable_props(
        component, tool_id=f"pd:{component_id}", action_id=component_id
    )
    skip_types = {"app", "$.service.db", "$.interface.http", "$.interface.timer", "alert"}
    props = []
    for prop in schema.props:
        raw_type = str(prop.raw.get("type") or "")
        if prop.kind == "connection" or raw_type in skip_types:
            continue
        props.append(
            {
                "name": prop.name,
                "label": prop.label or prop.name,
                "required": prop.required,
                "description": prop.description,
                "type": prop.json_type,
                "remote_options": prop.remote_options,
            }
        )
    return {
        "component_id": component_id,
        "found": True,
        "name": component.get("name") or component_id,
        "app_id": schema.app_id,
        "props": props,
    }


@router.get("/integrations/triggers/{component_id}/options")
async def trigger_dynamic_options(
    component_id: str,
    user: CurrentUser,
    prop: str = Query(..., max_length=128),
    agent_id: str | None = Query(default=None),
    app_id: str | None = Query(default=None, max_length=128),
) -> dict[str, Any]:
    """Remote options for a trigger / source prop (same Connect configure API)."""
    client = PipedreamClient()
    configured: dict[str, Any] = {}
    if agent_id and app_id:
        try:
            from agent_service.connections.manager import ConnectionManager
            from agent_service.integrations.pipedream.knowledge import hint_for_app
            from agent_service.integrations.pipedream.accounts import (
                _apps_equivalent,
            )

            mgr = ConnectionManager()
            connections = await mgr.list_connections(user_id=user.user_id)
            auth_id = None
            for conn in connections or []:
                if conn.get("provider") != "pipedream":
                    continue
                meta = conn.get("provider_metadata") or {}
                conn_app = meta.get("app_id") if isinstance(meta, dict) else None
                if not _apps_equivalent(str(conn_app or ""), app_id):
                    continue
                status = str(conn.get("status") or "").lower()
                if status not in {"active", "connected", "ok", "needs_reauth", ""}:
                    continue
                auth_id = conn.get("external_account_id")
                if auth_id:
                    break
            if auth_id:
                auth_block = {"authProvisionId": str(auth_id)}
                configured[app_id] = auth_block
                hint = hint_for_app(app_id)
                guess = hint.get("auth_prop_guess") if isinstance(hint, dict) else None
                if isinstance(guess, str) and guess.strip():
                    configured[guess.strip()] = auth_block
        except Exception:  # noqa: BLE001
            pass
    try:
        rows = await client.configure_prop(
            action_id=component_id,
            prop_name=prop,
            external_user_id=user.user_id,
            configured_props=configured,
        )
    except Exception:  # noqa: BLE001
        rows = []
    options: list[dict[str, Any]] = []
    for row in rows or []:
        if isinstance(row, dict):
            value = row.get("value") if "value" in row else row.get("id")
            label = row.get("label") or row.get("name") or value
            if value is None:
                continue
            options.append({"value": value, "label": label})
        else:
            options.append({"value": row, "label": str(row)})
    return {"options": options}


@router.get("/integrations/tools/search")
async def search_integration_tools(
    user: CurrentUser,
    q: str = Query(default="", max_length=200),
    limit: int = Query(default=20, ge=1, le=50),
) -> dict[str, Any]:
    _ = user
    registry = get_provider_registry()
    tools = await registry.search_tools(q, limit=limit)
    return {"query": q, "tools": [t.brief() for t in tools]}
