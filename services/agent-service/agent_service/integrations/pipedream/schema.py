"""Normalize Pipedream configurable_props into Stack32 tool schemas.

Pipedream props are component definitions (arrays of typed objects), not JSON Schema.
We classify each prop as:
  - connection: app/auth accounts (server-injected, never LLM)
  - static: Build/Structure configuration (channel, calendar, sheet, …)
  - runtime: LLM arguments at Live execution time
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

ParamKind = Literal["connection", "static", "runtime"]

_STATIC_NAME_HINTS = frozenset(
    {
        "channel",
        "channelid",
        "conversation",
        "conversationid",
        "calendar",
        "calendarid",
        "spreadsheet",
        "spreadsheetid",
        "sheet",
        "sheetid",
        "sheetname",
        "worksheet",
        "worksheetid",
        "worksheetids",
        "database",
        "databaseid",
        "page",
        "pageid",
        "parentpageid",
        "pipeline",
        "pipelineid",
        "board",
        "list",
        "workspace",
        "team",
        "repo",
        "repository",
        "baseid",
        "tableid",
        "documentid",
        "docid",
        "folderid",
        "fileid",
        "inboxid",
        "designtype",
    }
)

# Structure UX: treat these pickers as required even when Pipedream marks optional.
_CRITICAL_REQUIRED_STATIC = frozenset(
    {
        "channel",
        "channelid",
        "conversation",
        "conversationid",
        "spreadsheet",
        "spreadsheetid",
        "sheet",
        "sheetid",
        "sheetname",
        "worksheet",
        "worksheetid",
        "worksheetids",
        "database",
        "databaseid",
        "page",
        "pageid",
        "parentpageid",
        "baseid",
        "tableid",
        "documentid",
        "docid",
        "folderid",
        "fileid",
        "inboxid",
        "repo",
        "repository",
        "owner",
        "designtype",
        "calendarid",
    }
)

# Advanced Structure fields — optional even when remoteOptions.
_ADVANCED_ONLY_STATIC = frozenset(
    {
        "hasheaders",
        "headerrownumber",
        "watchdrive",
        "drive",
        "driveid",
        "timer",
        "asuser",
        "as_user",
        "ignorelinebreaks",
        "includelinebreaks",
    }
)


@dataclass
class NormalizedProp:
    name: str
    kind: ParamKind
    json_type: str
    required: bool = False
    description: str = ""
    label: str = ""
    default: Any = None
    enum: list[Any] | None = None
    remote_options: bool = False
    app_slug: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class NormalizedToolSchema:
    tool_id: str
    action_id: str
    app_id: str | None
    version: str | None
    props: list[NormalizedProp]
    auth_prop_name: str | None = None

    def props_of(self, kind: ParamKind) -> list[NormalizedProp]:
        return [p for p in self.props if p.kind == kind]

    def llm_json_schema(self, *, include_static_unconfigured: bool = False) -> dict[str, Any]:
        """OpenAI/LiteLLM-compatible function parameters schema (runtime (+ optional static))."""
        properties: dict[str, Any] = {}
        required: list[str] = []
        for prop in self.props:
            if prop.kind == "connection":
                continue
            if prop.kind == "static" and not include_static_unconfigured:
                continue
            schema = _prop_to_json_schema(prop)
            properties[prop.name] = schema
            if prop.required:
                required.append(prop.name)
        out: dict[str, Any] = {
            "type": "object",
            "properties": properties,
            "additionalProperties": False,
        }
        if required:
            out["required"] = required
        return out

    def static_config_schema(self) -> dict[str, Any]:
        properties: dict[str, Any] = {}
        required: list[str] = []
        for prop in self.props_of("static"):
            properties[prop.name] = _prop_to_json_schema(prop)
            if prop.required:
                required.append(prop.name)
        out: dict[str, Any] = {
            "type": "object",
            "properties": properties,
            "additionalProperties": False,
        }
        if required:
            out["required"] = required
        return out


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _prop_entries(configurable_props: Any) -> list[dict[str, Any]]:
    if configurable_props is None:
        return []
    if isinstance(configurable_props, list):
        return [p for p in configurable_props if isinstance(p, dict) and p.get("name")]
    if isinstance(configurable_props, dict):
        # Rare: already keyed map
        out: list[dict[str, Any]] = []
        for name, meta in configurable_props.items():
            if isinstance(meta, dict):
                out.append({"name": name, **meta})
            else:
                out.append({"name": name, "type": "string"})
        return out
    return []


def _map_json_type(prop_type: str) -> str:
    t = (prop_type or "string").lower()
    if t in {"string", "text", "textarea", "email", "url", "sql", "code", "datetime", "date", "time"}:
        return "string"
    if t in {"integer", "int"}:
        return "integer"
    if t in {"number", "float", "double"}:
        return "number"
    if t in {"boolean", "bool"}:
        return "boolean"
    if t in {"object", "any", "$.interface.http"}:
        return "object"
    if t.endswith("[]") or t in {"string[]", "integer[]", "number[]", "array"}:
        return "array"
    if t == "app":
        return "object"
    return "string"


def _classify(prop: dict[str, Any]) -> ParamKind:
    prop_type = str(prop.get("type") or "").lower()
    name = str(prop.get("name") or "").lower().replace("_", "").replace("-", "")
    if prop_type == "app" or prop.get("app") or prop.get("authProvisionId") is not None:
        return "connection"
    if name in {"authprovisionid", "auth", "account", "connectedaccount"}:
        return "connection"
    if prop.get("remoteOptions") is True or prop.get("useQuery") is True:
        return "static"
    if name in _STATIC_NAME_HINTS:
        return "static"
    # Optional selects with static options often are configuration
    if prop.get("options") and name in _STATIC_NAME_HINTS:
        return "static"
    return "runtime"


def _prop_to_json_schema(prop: NormalizedProp) -> dict[str, Any]:
    schema: dict[str, Any] = {"type": prop.json_type}
    if prop.description:
        schema["description"] = prop.description
    elif prop.label:
        schema["description"] = prop.label
    if prop.enum:
        schema["enum"] = prop.enum
    if prop.default is not None:
        schema["default"] = prop.default
    if prop.json_type == "array":
        schema.setdefault("items", {"type": "string"})
    raw = prop.raw if isinstance(prop.raw, dict) else {}
    if raw.get("reloadProps") or raw.get("reload_props"):
        schema["x-reload-props"] = True
    if prop.remote_options:
        schema["x-remote-options"] = True
    return schema


def normalize_configurable_props(
    component: dict[str, Any] | None,
    *,
    tool_id: str = "",
    action_id: str = "",
) -> NormalizedToolSchema:
    component = component or {}
    action_id = action_id or str(component.get("key") or component.get("id") or "")
    app = component.get("app")
    app_id: str | None = None
    if isinstance(app, dict):
        app_id = str(app.get("name_slug") or app.get("nameSlug") or app.get("id") or "") or None
    elif isinstance(app, str):
        app_id = app

    raw_props = component.get("configurable_props")
    if raw_props is None:
        raw_props = component.get("props")

    props: list[NormalizedProp] = []
    auth_prop_name: str | None = None
    for entry in _prop_entries(raw_props):
        name = str(entry.get("name") or "")
        if not name:
            continue
        kind = _classify(entry)
        prop_type = str(entry.get("type") or "string")
        json_type = _map_json_type(prop_type)
        app_slug = None
        if kind == "connection":
            app_slug = str(entry.get("app") or app_id or name)
            auth_prop_name = auth_prop_name or name
        options = entry.get("options")
        enum: list[Any] | None = None
        if isinstance(options, list) and options and all(
            not isinstance(o, dict) for o in options
        ):
            enum = list(options)
        elif isinstance(options, list):
            labels = []
            for o in options:
                if isinstance(o, dict):
                    labels.append(o.get("value") if "value" in o else o.get("label"))
                else:
                    labels.append(o)
            enum = [x for x in labels if x is not None] or None

        props.append(
            NormalizedProp(
                name=name,
                kind=kind,
                json_type=json_type,
                required=bool(entry.get("optional") is False)
                or (entry.get("optional") is None and bool(entry.get("required"))),
                description=str(entry.get("description") or ""),
                label=str(entry.get("label") or name),
                default=entry.get("default"),
                enum=enum,
                remote_options=bool(entry.get("remoteOptions") or entry.get("useQuery")),
                app_slug=app_slug,
                raw=entry,
            )
        )

    # Pipedream marks optional=True for optional; required when optional is missing/false
    for prop in props:
        raw = prop.raw
        if "optional" in raw:
            prop.required = not bool(raw.get("optional"))
        elif "required" in raw:
            prop.required = bool(raw.get("required"))
        else:
            # Auth app props are required for execution but never LLM-facing
            prop.required = prop.kind == "connection"

        # Resource pickers (sheet, channel, table…) must be configured in Structure
        # even when Pipedream marks them optional — deploy fails without them.
        compact = prop.name.lower().replace("_", "").replace("-", "")
        if prop.kind == "static" and compact in _CRITICAL_REQUIRED_STATIC:
            prop.required = True
        # Any remoteOptions picker is a Structure resource — required unless advanced-only.
        if (
            prop.kind == "static"
            and prop.remote_options
            and compact not in _ADVANCED_ONLY_STATIC
        ):
            prop.required = True

    return NormalizedToolSchema(
        tool_id=tool_id or (f"pd:{action_id}" if action_id else "pd:unknown"),
        action_id=action_id,
        app_id=app_id,
        version=str(component.get("version")) if component.get("version") else None,
        props=props,
        auth_prop_name=auth_prop_name,
    )


def build_configured_props(
    schema: NormalizedToolSchema,
    *,
    auth_provision_id: str | None,
    static_config: dict[str, Any] | None = None,
    runtime_args: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Merge server auth + static agent config + validated runtime args for run_action."""
    configured: dict[str, Any] = {}
    static_config = dict(static_config or {})
    runtime_args = dict(runtime_args or {})

    # Strip any attempt by the model to set auth fields
    for banned in (
        "auth_provision_id",
        "authProvisionId",
        "external_account_id",
        "connection_id",
        "oauth_token",
        "access_token",
    ):
        runtime_args.pop(banned, None)
        static_config.pop(banned, None)

    if auth_provision_id and schema.auth_prop_name:
        configured[schema.auth_prop_name] = {"authProvisionId": auth_provision_id}

    try:
        from agent_service.integrations.pipedream.tool_config import (
            normalize_static_config_for_schema,
        )

        static_config = normalize_static_config_for_schema(
            static_config, schema, app_id=schema.app_id
        )
    except Exception:  # noqa: BLE001
        pass

    for prop in schema.props_of("static"):
        if prop.name in static_config:
            configured[prop.name] = static_config[prop.name]

    for prop in schema.props_of("runtime"):
        if prop.name in runtime_args:
            configured[prop.name] = runtime_args[prop.name]
        elif prop.name in static_config and prop.name not in configured:
            # Allow static form to pre-fill runtime fields when user configured them
            configured[prop.name] = static_config[prop.name]

    return configured
