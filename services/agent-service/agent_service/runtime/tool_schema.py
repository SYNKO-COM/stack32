"""Normalized tool-call schema for the generated-agent runtime."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class RuntimeToolCall(BaseModel):
    call_id: str = Field(min_length=1)
    tool_id: str = Field(min_length=1)
    arguments: dict[str, Any] = Field(default_factory=dict)


def _fn(
    name: str,
    description: str,
    properties: dict[str, Any] | None = None,
    required: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": name,
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
            "name": tool_id,
            "description": f"Tool {tool_id}",
            "parameters": params,
        },
    }


def schemas_for_tools(
    tool_ids: list[str],
    *,
    catalog_schemas: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Return OpenAI tool schemas; unknown ids get a generic or catalog-backed schema."""
    out: list[dict[str, Any]] = []
    catalog_schemas = catalog_schemas or {}
    for tid in tool_ids:
        if tid in OPENAI_TOOL_SCHEMAS:
            out.append(OPENAI_TOOL_SCHEMAS[tid])
            continue
        if tid in catalog_schemas:
            out.append(_generic_schema(tid, catalog_schemas[tid]))
            continue
        # Best-effort: pull from provider registry catalog when available.
        try:
            from agent_service.integrations.native import NATIVE_TOOLS

            native = next((t for t in NATIVE_TOOLS if t.tool_id == tid), None)
            if native and native.input_schema:
                out.append(_generic_schema(tid, native.input_schema))
                continue
        except Exception:  # noqa: BLE001
            pass
        out.append(_generic_schema(tid))
    return out
