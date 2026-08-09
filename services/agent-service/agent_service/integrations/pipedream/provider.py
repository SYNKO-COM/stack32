"""Pipedream Connect tool provider."""

from __future__ import annotations

import logging
import time
from typing import Any

from agent_service.integrations.normalize import CatalogTool, ToolRef
from agent_service.integrations.pipedream.client import PipedreamClient
from agent_service.integrations.risk import enrich_tool_risk_fields

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 300.0


class PipedreamToolProvider:
    name = "pipedream"

    def __init__(self, client: PipedreamClient | None = None) -> None:
        self._client = client or PipedreamClient()
        self._tool_cache: dict[str, tuple[float, CatalogTool]] = {}
        self._search_cache: dict[str, tuple[float, list[CatalogTool]]] = {}

    def _cache_get(self, cache: dict[str, tuple[float, Any]], key: str) -> Any | None:
        hit = cache.get(key)
        if not hit:
            return None
        expires, value = hit
        if time.time() > expires:
            cache.pop(key, None)
            return None
        return value

    def _cache_set(self, cache: dict[str, tuple[float, Any]], key: str, value: Any) -> None:
        cache[key] = (time.time() + _CACHE_TTL_SECONDS, value)

    def _action_to_catalog(self, action: dict[str, Any]) -> CatalogTool:
        action_id = str(action.get("action_id") or action.get("id") or "")
        name = str(action.get("name") or action_id)
        summary = str(action.get("summary") or "")
        app_id = action.get("app_id")
        risk_fields = enrich_tool_risk_fields(
            name=name, summary=summary, metadata=action, side_effect=True
        )
        tool_id = f"pd:{action_id}" if action_id and not str(action_id).startswith("pd:") else action_id
        return CatalogTool(
            tool_id=tool_id or "pd:unknown",
            name=name,
            summary=summary,
            provider="pipedream",
            provider_tool_id=action_id,
            provider_app_id=str(app_id) if app_id else None,
            risk=str(risk_fields["risk"]),
            side_effect=bool(risk_fields["side_effect"]),
            auth_type="oauth2",
            connection_required=True,
            approval_mode=str(risk_fields["approval_mode"]),
            keywords=[w for w in name.lower().split() if w],
            categories=["pipedream", str(app_id)] if app_id else ["pipedream"],
            input_schema={"type": "object", "properties": {}, "additionalProperties": True},
            version=str(action.get("version")) if action.get("version") else None,
            metadata={"source": "pipedream"},
        )

    async def search_apps(self, query: str, *, limit: int = 20) -> list[dict[str, Any]]:
        return await self._client.search_apps(query, limit=limit)

    async def search_tools(self, query: str, *, limit: int = 20) -> list[CatalogTool]:
        cache_key = f"{query.strip().lower()}|{limit}"
        cached = self._cache_get(self._search_cache, cache_key)
        if cached is not None:
            return cached
        actions = await self._client.search_actions(query, limit=limit)
        tools = [self._action_to_catalog(a) for a in actions]
        for tool in tools:
            self._cache_set(self._tool_cache, tool.tool_id, tool)
            if tool.provider_tool_id:
                self._cache_set(self._tool_cache, tool.provider_tool_id, tool)
        self._cache_set(self._search_cache, cache_key, tools)
        return tools

    async def get_tool(self, tool_id: str) -> CatalogTool | None:
        cached = self._cache_get(self._tool_cache, tool_id)
        if cached is not None:
            return cached
        key = tool_id.removeprefix("pd:")
        component = await self._client.get_component(key)
        if not component:
            # Last resort: search by id fragment.
            matches = await self.search_tools(key, limit=5)
            for match in matches:
                if match.tool_id == tool_id or match.provider_tool_id == key:
                    return match
            return None
        action = {
            "action_id": component.get("key") or key,
            "name": component.get("name") or key,
            "summary": component.get("description") or "",
            "app_id": (component.get("app") or {}).get("name_slug")
            if isinstance(component.get("app"), dict)
            else component.get("app"),
            "version": component.get("version"),
        }
        tool = self._action_to_catalog(action)
        # Prefer caller tool_id if already namespaced.
        if tool_id.startswith("pd:"):
            tool.tool_id = tool_id
        self._cache_set(self._tool_cache, tool.tool_id, tool)
        return tool

    async def get_tool_schema(self, tool_id: str) -> dict[str, Any] | None:
        tool = await self.get_tool(tool_id)
        if not tool:
            return None
        key = (tool.provider_tool_id or tool_id).removeprefix("pd:")
        component = await self._client.get_component(key)
        props = {}
        if isinstance(component, dict):
            props = component.get("configurable_props") or component.get("props") or {}
        return {
            "tool_id": tool.tool_id,
            "input_schema": {
                "type": "object",
                "properties": props if isinstance(props, dict) else {},
                "additionalProperties": True,
            },
            "version": tool.version,
        }

    async def get_auth_requirement(self, tool_id: str) -> dict[str, Any]:
        tool = await self.get_tool(tool_id)
        return {
            "auth_type": "oauth2",
            "connection_required": True,
            "provider_app_id": tool.provider_app_id if tool else None,
            "provider": "pipedream",
        }

    async def list_user_connections(
        self, *, user_id: str, app_id: str | None = None
    ) -> list[dict[str, Any]]:
        accounts = await self._client.list_accounts(external_user_id=user_id)
        if app_id:
            return [
                a
                for a in accounts
                if str(a.get("app") or a.get("app_id") or "") == app_id
            ]
        return accounts

    async def start_connection(
        self, *, user_id: str, app_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        token = await self._client.create_connect_token(user_id, app_id=app_id)
        return {"app_id": app_id, "connect": token}

    async def verify_connection(
        self, *, user_id: str, connection_id: str
    ) -> dict[str, Any]:
        accounts = await self.list_user_connections(user_id=user_id)
        match = next(
            (
                a
                for a in accounts
                if str(a.get("id") or a.get("account_id")) == connection_id
            ),
            None,
        )
        return {"ok": match is not None, "account": match}

    async def configure_tool(
        self, tool_ref: ToolRef, config: dict[str, Any]
    ) -> dict[str, Any]:
        return {"tool_id": tool_ref.tool_id, "config": config, "ok": True}

    async def get_dynamic_options(
        self, tool_ref: ToolRef, field: str, *, context: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        return []

    async def execute_tool(
        self,
        tool_ref: ToolRef,
        args: dict[str, Any],
        *,
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        context = context or {}
        user_id = str(context.get("user_id") or "")
        if not user_id:
            return {"error": "TOOL_CONTEXT_MISSING", "message": "user_id required"}
        action_id = tool_ref.provider_tool_id or tool_ref.tool_id.removeprefix("pd:")
        payload = dict(args)
        auth_provision_id = None
        if isinstance(payload.get("auth_provision_id"), str):
            auth_provision_id = str(payload.pop("auth_provision_id"))
        configured = payload
        if isinstance(payload.get("configured_props"), dict):
            configured = dict(payload["configured_props"])
        return await self._client.run_action(
            action_id=action_id,
            external_user_id=user_id,
            configured_props=configured,
            auth_provision_id=auth_provision_id,
        )

    async def health_check(self) -> dict[str, Any]:
        configured = self._client.configured()
        if not configured:
            return {
                "provider": self.name,
                "ok": True,
                "degraded": True,
                "message": "Pipedream credentials not configured.",
            }
        token = await self._client.get_access_token()
        return {
            "provider": self.name,
            "ok": bool(token),
            "degraded": not bool(token),
            "message": None if token else "Unable to obtain Pipedream access token.",
        }

    async def search_triggers(self, query: str, *, limit: int = 20) -> list[dict[str, Any]]:
        return []

    async def deploy_trigger(
        self, *, user_id: str, trigger_id: str, config: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        return {"deployed": False, "triggers": []}

    async def list_triggers(self, *, user_id: str) -> list[dict[str, Any]]:
        return []

    async def delete_trigger(self, *, user_id: str, trigger_id: str) -> dict[str, Any]:
        return {"deleted": False}
