"""Pipedream Connect tool provider."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from agent_service.integrations.normalize import CatalogTool, ToolRef
from agent_service.integrations.pipedream.client import PipedreamClient, PipedreamError
from agent_service.integrations.pipedream.schema import (
    build_configured_props,
    normalize_configurable_props,
)
from agent_service.integrations.risk import enrich_tool_risk_fields

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 300.0


class PipedreamToolProvider:
    name = "pipedream"

    def __init__(self, client: PipedreamClient | None = None) -> None:
        self._client = client or PipedreamClient()
        self._tool_cache: dict[str, tuple[float, CatalogTool]] = {}
        self._search_cache: dict[str, tuple[float, list[CatalogTool]]] = {}
        self._schema_cache: dict[str, tuple[float, Any]] = {}
        self._component_cache: dict[str, tuple[float, dict[str, Any]]] = {}

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

    def _action_to_catalog(
        self, action: dict[str, Any], *, input_schema: dict[str, Any] | None = None
    ) -> CatalogTool:
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
            input_schema=input_schema
            or {"type": "object", "properties": {}, "additionalProperties": False},
            version=str(action.get("version")) if action.get("version") else None,
            metadata={"source": "pipedream"},
        )

    @staticmethod
    def _looks_like_component_key(action_id: str) -> bool:
        """Pipedream component keys are typically `app-action` (contain a hyphen)."""
        key = action_id.removeprefix("pd:").strip()
        if not key or " " in key:
            return False
        return "-" in key

    @staticmethod
    def _valid_component(component: dict[str, Any], *, expected_key: str) -> bool:
        key = str(component.get("key") or component.get("name") or "").strip()
        if not key:
            return False
        expected = expected_key.removeprefix("pd:")
        # Reject empty / unrelated payloads the API sometimes returns for unknown ids.
        if key != expected and not key.endswith(expected) and expected not in key:
            # Allow when API returns canonical key that differs only by prefix/version.
            if str(component.get("name") or "") and (
                component.get("configurable_props") is not None
                or component.get("props") is not None
            ):
                return key.startswith(expected.split("-")[0])
            return False
        return True

    async def _load_component(self, action_id: str) -> dict[str, Any] | None:
        if not self._looks_like_component_key(action_id):
            return None
        cached = self._cache_get(self._component_cache, action_id)
        if cached is not None:
            return cached
        try:
            component = await self._client.get_component(action_id)
        except Exception:  # noqa: BLE001
            return None
        if isinstance(component, dict) and self._valid_component(component, expected_key=action_id):
            self._cache_set(self._component_cache, action_id, component)
            return component
        return None

    async def get_normalized_schema(self, tool_id: str):
        cached = self._cache_get(self._schema_cache, tool_id)
        if cached is not None:
            return cached
        key = tool_id.removeprefix("pd:")
        component = await self._load_component(key)
        schema = normalize_configurable_props(
            component, tool_id=tool_id if tool_id.startswith("pd:") else f"pd:{key}", action_id=key
        )
        self._cache_set(self._schema_cache, tool_id, schema)
        self._cache_set(self._schema_cache, f"pd:{key}", schema)
        if schema.app_id:
            try:
                from agent_service.integrations.pipedream.auto_hints import (
                    hint_from_normalized_schema,
                )
                from agent_service.integrations.pipedream.knowledge import register_runtime_app_hint

                register_runtime_app_hint(
                    schema.app_id,
                    hint_from_normalized_schema(schema),
                )
            except Exception:  # noqa: BLE001
                pass
        return schema

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
        if not self._looks_like_component_key(key) and not tool_id.startswith("pd:"):
            return None
        component = await self._load_component(key)
        if not component:
            if not self._looks_like_component_key(key):
                return None
            matches = await self.search_tools(key, limit=5)
            for match in matches:
                if match.tool_id == tool_id or match.provider_tool_id == key:
                    return match
            return None
        schema = normalize_configurable_props(
            component,
            tool_id=tool_id if tool_id.startswith("pd:") else f"pd:{key}",
            action_id=str(component.get("key") or key),
        )
        action = {
            "action_id": component.get("key") or key,
            "name": component.get("name") or key,
            "summary": component.get("description") or "",
            "app_id": schema.app_id,
            "version": component.get("version"),
        }
        tool = self._action_to_catalog(action, input_schema=schema.llm_json_schema())
        if tool_id.startswith("pd:"):
            tool.tool_id = tool_id
        self._cache_set(self._tool_cache, tool.tool_id, tool)
        self._cache_set(self._schema_cache, tool.tool_id, schema)
        return tool

    async def get_tool_schema(self, tool_id: str) -> dict[str, Any] | None:
        tool = await self.get_tool(tool_id)
        if not tool:
            return None
        schema = await self.get_normalized_schema(tool.tool_id)
        return {
            "tool_id": tool.tool_id,
            "provider": "pipedream",
            "provider_tool_id": tool.provider_tool_id,
            "provider_app_id": tool.provider_app_id or schema.app_id,
            "auth_prop_name": schema.auth_prop_name,
            "version": schema.version or tool.version,
            "input_schema": schema.llm_json_schema(),
            "static_schema": schema.static_config_schema(),
            "param_kinds": {p.name: p.kind for p in schema.props},
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
        accounts = await self._client.list_accounts(external_user_id=user_id, app=app_id)
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
        schema = await self.get_normalized_schema(tool_ref.tool_id)
        allowed = {p.name for p in schema.props if p.kind in {"static", "runtime"}}
        cleaned = {k: v for k, v in config.items() if k in allowed}
        return {"tool_id": tool_ref.tool_id, "config": cleaned, "ok": True}

    async def get_dynamic_options(
        self, tool_ref: ToolRef, field: str, *, context: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        context = context or {}
        user_id = str(context.get("user_id") or "")
        auth_provision_id = context.get("auth_provision_id")
        static_config = context.get("configured_props") or context.get("config") or {}
        action_id = (tool_ref.provider_tool_id or tool_ref.tool_id).removeprefix("pd:")
        schema = await self.get_normalized_schema(tool_ref.tool_id)
        configured = build_configured_props(
            schema,
            auth_provision_id=str(auth_provision_id) if auth_provision_id else None,
            static_config=dict(static_config) if isinstance(static_config, dict) else {},
            runtime_args={},
        )
        try:
            rows = await self._client.configure_prop(
                action_id=action_id,
                prop_name=field,
                external_user_id=user_id,
                configured_props=configured,
            )
        except PipedreamError as exc:
            logger.warning("pipedream_configure_failed field=%s err=%s", field, exc)
            return []
        options: list[dict[str, Any]] = []
        for row in rows:
            if isinstance(row, dict):
                value = row.get("value") if "value" in row else row.get("id")
                label = row.get("label") or row.get("name") or value
                if value is None:
                    continue
                options.append({"value": value, "label": label})
            else:
                options.append({"value": row, "label": str(row)})
        return options

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
        schema = await self.get_normalized_schema(tool_ref.tool_id)

        # Server-resolved account — never trust model args for auth.
        auth_provision_id = context.get("auth_provision_id") or context.get("external_account_id")
        if not auth_provision_id:
            return {
                "error": "CONNECTION_REQUIRED",
                "provider": "pipedream",
                "app_id": schema.app_id or tool_ref.provider_app_id,
                "tool_id": tool_ref.tool_id,
                "message": "Connect this app before the agent can use it.",
            }

        static_config = context.get("tool_config") or context.get("static_config") or {}
        runtime_args = dict(args or {})
        if isinstance(runtime_args.get("configured_props"), dict):
            # Flatten accidental nesting from older clients
            nested = dict(runtime_args.pop("configured_props"))
            runtime_args = {**nested, **runtime_args}

        # Canva create-design uses reloadProps: designType=preset requires `name`
        # (e.g. doc / presentation). Models often omit both → API "'name' must not be null".
        if str(action_id).endswith("canva-create-design") or tool_ref.tool_id.endswith(
            "canva-create-design"
        ):
            if not runtime_args.get("designType"):
                runtime_args["designType"] = "preset"
            if runtime_args.get("designType") == "preset" and not runtime_args.get("name"):
                runtime_args["name"] = (
                    runtime_args.get("preset")
                    or runtime_args.get("type")
                    or "doc"
                )
            if not runtime_args.get("title"):
                runtime_args["title"] = (
                    runtime_args.get("designTitle")
                    or runtime_args.get("design_name")
                    or "Untitled design"
                )

        configured = build_configured_props(
            schema,
            auth_provision_id=str(auth_provision_id),
            static_config=dict(static_config) if isinstance(static_config, dict) else {},
            runtime_args=runtime_args,
        )

        # reloadProps (e.g. Canva `name` after designType=preset) are absent from the
        # base schema — inject them directly so run_action still receives them.
        dynamic_props_id: str | None = None
        needs_reload = any(
            bool((p.raw or {}).get("reloadProps") or (p.raw or {}).get("reload_props"))
            for p in (schema.props or [])
        ) or str(action_id).endswith("canva-create-design")
        if str(action_id).endswith("canva-create-design") or tool_ref.tool_id.endswith(
            "canva-create-design"
        ):
            for key in ("designType", "name", "title", "assetId", "width", "height"):
                if key in runtime_args and runtime_args[key] not in (None, ""):
                    configured[key] = runtime_args[key]
            needs_reload = True

        if needs_reload:
            # Seed only auth + reload trigger props for the props reload call.
            seed = {
                k: v
                for k, v in configured.items()
                if k
                in {
                    schema.auth_prop_name,
                    "designType",
                    "sheetId",
                    "drive",
                    "worksheetId",
                }
                or k == schema.auth_prop_name
            }
            if schema.auth_prop_name and schema.auth_prop_name in configured:
                seed[schema.auth_prop_name] = configured[schema.auth_prop_name]
            if "designType" in configured:
                seed["designType"] = configured["designType"]
            reloaded = await self._client.reload_props(
                action_id=action_id,
                external_user_id=user_id,
                configured_props=seed,
                version=schema.version,
            )
            if isinstance(reloaded, dict) and reloaded.get("dynamic_props_id"):
                dynamic_props_id = str(reloaded["dynamic_props_id"])

        result = await self._client.run_action(
            action_id=action_id,
            external_user_id=user_id,
            configured_props=configured,
            version=schema.version,
            dynamic_props_id=dynamic_props_id,
        )
        if isinstance(result, dict) and result.get("error"):
            err = result.get("error")
            message = (
                result.get("message")
                or result.get("detail")
                or (
                    err.get("message")
                    if isinstance(err, dict)
                    else None
                )
                or f"Pipedream action failed for {action_id}"
            )
            if isinstance(err, dict) and not result.get("message"):
                message = str(err.get("message") or err.get("name") or message)[:400]
            try:
                from agent_service.learning.playbooks import record_tool_playbook_failure

                asyncio.create_task(
                    record_tool_playbook_failure(
                        tool_id=tool_ref.tool_id,
                        action_id=str(action_id),
                        app_id=schema.app_id or tool_ref.provider_app_id,
                        error_message=str(message)[:400],
                    )
                )
            except Exception:  # noqa: BLE001
                logger.debug("tool_playbook_failure_record_skipped", exc_info=True)
            return {
                **{k: v for k, v in result.items() if k != "error"},
                "error": "PIPEDREAM_ACTION_FAILED"
                if isinstance(err, dict)
                else (err or "PIPEDREAM_ACTION_FAILED"),
                "message": str(message)[:400],
                "provider": "pipedream",
                "tool_id": tool_ref.tool_id,
            }
        try:
            from agent_service.learning.playbooks import record_tool_playbook_success

            auth_key = schema.auth_prop_name
            static_for_learn = {
                k: v
                for k, v in configured.items()
                if k != auth_key and not (isinstance(v, dict) and "authProvisionId" in v)
            }
            asyncio.create_task(
                record_tool_playbook_success(
                    tool_id=tool_ref.tool_id,
                    action_id=str(action_id),
                    app_id=schema.app_id or tool_ref.provider_app_id,
                    static_config=static_for_learn,
                    runtime_keys=list(runtime_args.keys()),
                    needs_dynamic_props=bool(dynamic_props_id),
                    notes="auto from successful Live run",
                )
            )
        except Exception:  # noqa: BLE001
            logger.debug("tool_playbook_success_record_skipped", exc_info=True)
        return {"ok": True, "provider": "pipedream", "tool_id": tool_ref.tool_id, "result": result}

    async def health_check(self) -> dict[str, Any]:
        """Health semantics for an optional integration.

        - ``ok``: provider module is healthy (does not crash the agent service)
        - ``configured``: credentials are present
        - ``degraded``: configured but unreachable, OR intentionally unconfigured
        """
        configured = self._client.configured()
        if not configured:
            return {
                "provider": self.name,
                "ok": True,
                "configured": False,
                "degraded": True,
                "message": "Pipedream credentials not configured.",
            }
        token = await self._client.get_access_token()
        return {
            "provider": self.name,
            "ok": bool(token),
            "configured": True,
            "degraded": not bool(token),
            "message": None if token else "Unable to obtain Pipedream access token.",
        }

    async def search_triggers(self, query: str, *, limit: int = 20) -> list[dict[str, Any]]:
        return await self._client.search_triggers(query, limit=limit)

    async def deploy_trigger(
        self, *, user_id: str, trigger_id: str, config: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        cfg = config or {}
        webhook_url = str(cfg.get("webhook_url") or "")
        if not webhook_url:
            return {"deployed": False, "error": "webhook_url_required"}
        data = await self._client.deploy_trigger(
            external_user_id=user_id,
            trigger_id=trigger_id,
            configured_props=cfg.get("configured_props")
            if isinstance(cfg.get("configured_props"), dict)
            else {},
            webhook_url=webhook_url,
            emit_on_deploy=bool(cfg.get("emit_on_deploy", False)),
        )
        return {"deployed": True, "trigger": data}

    async def list_triggers(self, *, user_id: str) -> list[dict[str, Any]]:
        _ = user_id
        return []

    async def delete_trigger(self, *, user_id: str, trigger_id: str) -> dict[str, Any]:
        ok = await self._client.delete_deployed_trigger(
            deployed_id=trigger_id, external_user_id=user_id
        )
        return {"deleted": ok}
