"""Normalized tool-call schema for the generated-agent runtime."""

from __future__ import annotations

import logging
import re
from typing import Any

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class RuntimeToolCall(BaseModel):
    call_id: str = Field(min_length=1)
    tool_id: str = Field(min_length=1)
    arguments: dict[str, Any] = Field(default_factory=dict)


# OpenAI function.name must match ^[a-zA-Z0-9_-]+$ — colons in pd:… are rejected.
_OPENAI_FN_SAFE = re.compile(r"[^a-zA-Z0-9_-]+")


def to_openai_function_name(tool_id: str) -> str:
    """Sanitize a Stack32 tool_id for OpenAI/Anthropic function calling."""
    name = _OPENAI_FN_SAFE.sub("_", (tool_id or "").strip())
    return name or "tool"


def from_openai_function_name(name: str, allowed_tool_ids: list[str] | set[str]) -> str:
    """Map a sanitized function name back to the original tool_id."""
    raw = (name or "").strip()
    allowed = list(allowed_tool_ids)
    if raw in allowed:
        return raw
    for tid in allowed:
        if to_openai_function_name(tid) == raw:
            return tid
    return raw


def _fn(
    name: str,
    description: str,
    properties: dict[str, Any] | None = None,
    required: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": to_openai_function_name(name),
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties or {},
                "required": required or [],
            },
        },
    }


# OpenAI-style tool definitions for allowlisted MVP + Google connector tools.
OPENAI_TOOL_SCHEMAS: dict[str, dict[str, Any]] = {
    "calculator": _fn(
        "calculator",
        "Evaluate a basic arithmetic expression.",
        {"expression": {"type": "string"}},
        ["expression"],
    ),
    "current_datetime": _fn(
        "current_datetime",
        "Return the current UTC date and time.",
    ),
    "web_search": _fn(
        "web_search",
        "Search the public web for up-to-date information.",
        {"query": {"type": "string"}},
        ["query"],
    ),
    "fetch_url": _fn(
        "fetch_url",
        "Fetch text content from a public HTTP(S) URL.",
        {"url": {"type": "string"}},
        ["url"],
    ),
    "knowledge_search": _fn(
        "knowledge_search",
        "Search the agent's knowledge base.",
        {"query": {"type": "string"}},
        ["query"],
    ),
    "structured_output": _fn(
        "structured_output",
        "Emit a structured JSON payload for the user.",
        {"payload": {"type": "object"}},
        ["payload"],
    ),
    "gmail_list": _fn(
        "gmail_list",
        "List Gmail messages matching a query.",
        {"query": {"type": "string"}, "max_results": {"type": "integer"}},
    ),
    "gmail_read": _fn(
        "gmail_read",
        "Read a single Gmail message by id.",
        {"message_id": {"type": "string"}},
        ["message_id"],
    ),
    "gmail_create_draft": _fn(
        "gmail_create_draft",
        "Create a Gmail draft without sending.",
        {
            "to": {"type": "string"},
            "subject": {"type": "string"},
            "body": {"type": "string"},
        },
        ["to", "subject", "body"],
    ),
    "gmail_send_message": _fn(
        "gmail_send_message",
        "Send an email via Gmail.",
        {
            "to": {"type": "string"},
            "subject": {"type": "string"},
            "body": {"type": "string"},
            "dry_run": {"type": "boolean"},
        },
        ["to", "subject", "body"],
    ),
    "gmail_send": _fn(
        "gmail_send",
        "Send an email via Gmail.",
        {
            "to": {"type": "string"},
            "subject": {"type": "string"},
            "body": {"type": "string"},
            "dry_run": {"type": "boolean"},
        },
        ["to", "subject", "body"],
    ),
    "google_docs_create": _fn(
        "google_docs_create",
        "Create a Google Doc.",
        {"title": {"type": "string"}, "body": {"type": "string"}},
        ["title"],
    ),
    "google_docs_append": _fn(
        "google_docs_append",
        "Append text to a Google Doc.",
        {"document_id": {"type": "string"}, "text": {"type": "string"}},
        ["document_id", "text"],
    ),
    "calendar_list": _fn(
        "calendar_list",
        "List upcoming Google Calendar events.",
        {"max_results": {"type": "integer"}},
    ),
    "calendar_create_event": _fn(
        "calendar_create_event",
        "Create a Google Calendar event.",
        {
            "title": {"type": "string"},
            "start": {"type": "string"},
            "end": {"type": "string"},
            "description": {"type": "string"},
            "dry_run": {"type": "boolean"},
        },
        ["title", "start", "end"],
    ),
    "http_request": _fn(
        "http_request",
        "Perform an HTTP request to a configured API endpoint.",
        {
            "method": {"type": "string"},
            "url": {"type": "string"},
            "headers": {"type": "object"},
            "body": {},
        },
        ["url"],
    ),
}


def _generic_schema(tool_id: str, catalog_schema: dict[str, Any] | None = None) -> dict[str, Any]:
    params = catalog_schema if isinstance(catalog_schema, dict) else {
        "type": "object",
        "properties": {},
        "required": [],
    }
    if params.get("type") != "object":
        params = {"type": "object", "properties": {"input": params}, "required": []}
    return {
        "type": "function",
        "function": {
            "name": to_openai_function_name(tool_id),
            "description": f"Tool {tool_id}",
            "parameters": params,
        },
    }


def schemas_for_tools(
    tool_ids: list[str],
    *,
    catalog_schemas: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Sync helper — prefer async_schemas_for_tools for external providers."""
    out: list[dict[str, Any]] = []
    catalog_schemas = catalog_schemas or {}
    for tid in tool_ids:
        if tid in OPENAI_TOOL_SCHEMAS:
            out.append(OPENAI_TOOL_SCHEMAS[tid])
            continue
        if tid in catalog_schemas:
            out.append(_generic_schema(tid, catalog_schemas[tid]))
            continue
        try:
            from agent_service.integrations.native import NATIVE_TOOLS

            native = next((t for t in NATIVE_TOOLS if t.tool_id == tid), None)
            if native and native.input_schema:
                out.append(_generic_schema(tid, native.input_schema))
                continue
        except Exception:  # noqa: BLE001
            pass
        # External tools must not get an empty catch-all in production paths —
        # callers should use async_schemas_for_tools. Keep a narrow stub for tests.
        if tid.startswith("pd:"):
            out.append(
                _fn(
                    tid,
                    f"External Pipedream tool {tid} (schema pending load).",
                    {},
                    [],
                )
            )
            continue
        out.append(_generic_schema(tid))
    return out


async def async_schemas_for_tools(
    tool_ids: list[str],
    *,
    tool_configs: dict[str, dict[str, Any]] | None = None,
    catalog_schemas: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Load OpenAI schemas; JIT-normalize Pipedream props and strip configured static fields."""
    from agent_service.integrations.registry import get_provider_registry

    tool_configs = tool_configs or {}
    catalog_schemas = catalog_schemas or {}
    registry = get_provider_registry()
    out: list[dict[str, Any]] = []

    for tid in tool_ids:
        if tid in OPENAI_TOOL_SCHEMAS:
            out.append(OPENAI_TOOL_SCHEMAS[tid])
            continue
        if tid in catalog_schemas:
            out.append(_generic_schema(tid, catalog_schemas[tid]))
            continue

        provider = None
        if tid.startswith("pd:"):
            provider = registry.get_provider("pipedream")
        if provider is None and tid.startswith("pd:"):
            out.append(
                _fn(tid, f"External tool {tid} (provider unavailable)", {}, [])
            )
            continue
        if provider is None:
            try:
                from agent_service.integrations.native import NATIVE_TOOLS

                native = next((t for t in NATIVE_TOOLS if t.tool_id == tid), None)
                if native and native.input_schema:
                    out.append(_generic_schema(tid, native.input_schema))
                    continue
            except Exception:  # noqa: BLE001
                pass
            out.append(_generic_schema(tid))
            continue

        schema_payload = await provider.get_tool_schema(tid)
        if not schema_payload or not isinstance(schema_payload.get("input_schema"), dict):
            out.append(
                _fn(tid, f"External tool {tid}", {"_note": {"type": "string"}}, [])
            )
            continue

        input_schema = dict(schema_payload["input_schema"])
        configured = tool_configs.get(tid) or {}
        props = dict(input_schema.get("properties") or {})
        # If static fields are already configured on the agent, hide them from the LLM.
        static_schema = schema_payload.get("static_schema") or {}
        static_props = (static_schema.get("properties") or {}) if isinstance(static_schema, dict) else {}
        app_id = schema_payload.get("provider_app_id")
        try:
            from agent_service.integrations.pipedream.tool_config import is_static_prop_configured
        except Exception:  # noqa: BLE001
            # Falling back to a naive key check stops static props being hidden
            # from the model, so it re-asks for values already configured.
            logger.exception("is_static_prop_configured_import_failed tool_id=%s", tid)
            is_static_prop_configured = None  # type: ignore[assignment,misc]
        for key in list(props.keys()):
            filled = (
                is_static_prop_configured(key, configured, app_id=app_id)
                if is_static_prop_configured
                else key in configured and configured[key] not in (None, "")
            )
            if filled and key in static_props:
                props.pop(key, None)
        required = [
            r
            for r in (input_schema.get("required") or [])
            if r in props
        ]
        # Also surface unconfigured required static props so the model can ask / fail clearly
        for key, meta in static_props.items():
            filled = (
                is_static_prop_configured(key, configured, app_id=app_id)
                if is_static_prop_configured
                else key in configured and configured[key] not in (None, "")
            )
            if not filled and key not in props:
                props[key] = meta
                if key in (static_schema.get("required") or []):
                    required.append(key)

        description = f"External tool {tid}"
        try:
            tool = await provider.get_tool(tid)
            if tool and tool.summary:
                description = tool.summary
            elif tool and tool.name:
                description = tool.name
        except Exception:  # noqa: BLE001
            pass

        out.append(
            {
                "type": "function",
                "function": {
                    "name": to_openai_function_name(tid),
                    "description": description,
                    "parameters": {
                        "type": "object",
                        "properties": props,
                        "required": required,
                        "additionalProperties": False,
                    },
                },
            }
        )
    return out
