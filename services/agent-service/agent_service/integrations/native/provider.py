"""Native tool provider — built-in Stack32 tools + Google connector tools."""

from __future__ import annotations

import logging
from typing import Any

from agent_service.integrations.normalize import CatalogTool, ToolRef
from agent_service.integrations.risk import enrich_tool_risk_fields

logger = logging.getLogger(__name__)

_EMPTY_SCHEMA: dict[str, Any] = {"type": "object", "properties": {}, "required": []}

_NATIVE_DEFS: list[dict[str, Any]] = [
    {
        "tool_id": "web_search",
        "name": "Web Search",
        "summary": "Search the web for current information.",
        "keywords": ["search", "web", "news", "research"],
        "categories": ["research"],
        "auth_type": "none",
        "connection_required": False,
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    },
    {
        "tool_id": "fetch_url",
        "name": "Fetch URL",
        "summary": "Fetch and read a public web page.",
        "keywords": ["url", "fetch", "web", "scrape"],
        "categories": ["research"],
        "auth_type": "none",
        "connection_required": False,
        "input_schema": {
            "type": "object",
            "properties": {"url": {"type": "string"}},
            "required": ["url"],
        },
    },
    {
        "tool_id": "knowledge_search",
        "name": "Knowledge Search",
        "summary": "Search the agent knowledge base (RAG).",
        "keywords": ["knowledge", "rag", "documents", "retrieval"],
        "categories": ["knowledge"],
        "auth_type": "none",
        "connection_required": False,
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    },
    {
        "tool_id": "calculator",
        "name": "Calculator",
        "summary": "Evaluate arithmetic expressions.",
        "keywords": ["math", "calculate", "arithmetic"],
        "categories": ["utility"],
        "auth_type": "none",
        "connection_required": False,
        "input_schema": {
            "type": "object",
            "properties": {"expression": {"type": "string"}},
            "required": ["expression"],
        },
    },
    {
        "tool_id": "current_datetime",
        "name": "Current Date/Time",
        "summary": "Get the current UTC datetime.",
        "keywords": ["time", "date", "now", "clock"],
        "categories": ["utility"],
        "auth_type": "none",
        "connection_required": False,
        "input_schema": _EMPTY_SCHEMA,
    },
    {
        "tool_id": "structured_output",
        "name": "Structured Output",
        "summary": "Return a structured JSON payload.",
        "keywords": ["json", "structured", "output"],
        "categories": ["utility"],
        "auth_type": "none",
        "connection_required": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "data": {"type": "object"},
                "schema_name": {"type": "string"},
            },
            "required": ["data"],
        },
    },
    {
        "tool_id": "gmail_list",
        "name": "Gmail List",
        "summary": "List Gmail messages matching a query.",
        "keywords": ["email", "gmail", "inbox", "list", "mail"],
        "categories": ["email", "google"],
        "auth_type": "oauth2",
        "connection_required": True,
        "provider_app_id": "gmail",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "max_results": {"type": "integer"},
            },
            "required": [],
        },
    },
    {
        "tool_id": "gmail_read",
        "name": "Gmail Read",
        "summary": "Read a single Gmail message by id.",
        "keywords": ["email", "gmail", "read", "mail"],
        "categories": ["email", "google"],
        "auth_type": "oauth2",
        "connection_required": True,
        "provider_app_id": "gmail",
        "input_schema": {
            "type": "object",
            "properties": {"message_id": {"type": "string"}},
            "required": ["message_id"],
        },
    },
    {
        "tool_id": "gmail_create_draft",
        "name": "Gmail Create Draft",
        "summary": "Create a Gmail draft without sending.",
        "keywords": ["email", "gmail", "draft", "mail"],
        "categories": ["email", "google"],
        "auth_type": "oauth2",
        "connection_required": True,
        "provider_app_id": "gmail",
        "side_effect": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "to": {"type": "string"},
                "subject": {"type": "string"},
                "body": {"type": "string"},
            },
            "required": ["to", "subject", "body"],
        },
    },
    {
        "tool_id": "gmail_send_message",
        "name": "Gmail Send Message",
        "summary": "Send an email via Gmail (side-effect).",
        "keywords": ["email", "gmail", "send", "mail"],
        "categories": ["email", "google"],
        "auth_type": "oauth2",
        "connection_required": True,
        "provider_app_id": "gmail",
        "side_effect": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "to": {"type": "string"},
                "subject": {"type": "string"},
                "body": {"type": "string"},
                "dry_run": {"type": "boolean"},
            },
            "required": ["to", "subject", "body"],
        },
    },
    {
        "tool_id": "gmail_send",
        "name": "Gmail Send (legacy)",
        "summary": "Legacy alias — creates a draft for backward compatibility.",
        "keywords": ["email", "gmail", "send", "mail", "draft"],
        "categories": ["email", "google"],
        "auth_type": "oauth2",
        "connection_required": True,
        "provider_app_id": "gmail",
        "side_effect": True,
        "metadata": {"alias_of": "gmail_create_draft", "deprecated": True},
        "input_schema": {
            "type": "object",
            "properties": {
                "to": {"type": "string"},
                "subject": {"type": "string"},
                "body": {"type": "string"},
                "dry_run": {"type": "boolean"},
            },
            "required": ["to", "subject", "body"],
        },
    },
    {
        "tool_id": "calendar_list",
        "name": "Calendar List",
        "summary": "List upcoming Google Calendar events.",
        "keywords": ["calendar", "events", "schedule", "list"],
        "categories": ["calendar", "google"],
        "auth_type": "oauth2",
        "connection_required": True,
        "provider_app_id": "google_calendar",
        "input_schema": {
            "type": "object",
            "properties": {"max_results": {"type": "integer"}},
            "required": [],
        },
    },
    {
        "tool_id": "calendar_create_event",
        "name": "Create Calendar Event",
        "summary": "Create a Google Calendar event.",
        "keywords": ["calendar", "event", "appointment", "schedule", "meeting", "create"],
        "categories": ["calendar", "google"],
        "auth_type": "oauth2",
        "connection_required": True,
        "provider_app_id": "google_calendar",
        "side_effect": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "start": {"type": "string"},
                "end": {"type": "string"},
                "description": {"type": "string"},
                "dry_run": {"type": "boolean"},
            },
            "required": ["title", "start", "end"],
        },
    },
    {
        "tool_id": "google_docs_create",
        "name": "Google Docs Create",
        "summary": "Create a Google Doc with an optional starting summary.",
        "keywords": [
            "google docs",
            "docs",
            "document",
            "create doc",
            "fichier",
            "drive",
        ],
        "categories": ["docs", "google"],
        "auth_type": "oauth2",
        "connection_required": True,
        "provider_app_id": "google_docs",
        "side_effect": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "body": {"type": "string"},
                "dry_run": {"type": "boolean"},
            },
            "required": ["title"],
        },
    },
    {
        "tool_id": "google_docs_append",
        "name": "Google Docs Append",
        "summary": "Append a new section to an existing Google Doc.",
        "keywords": [
            "google docs",
            "docs",
            "append",
            "update doc",
            "resume",
            "summary",
        ],
        "categories": ["docs", "google"],
        "auth_type": "oauth2",
        "connection_required": True,
        "provider_app_id": "google_docs",
        "side_effect": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "document_id": {"type": "string"},
                "text": {"type": "string"},
                "dry_run": {"type": "boolean"},
            },
            "required": ["document_id", "text"],
        },
    },
]


def _to_catalog(defn: dict[str, Any]) -> CatalogTool:
    risk_fields = enrich_tool_risk_fields(
        name=str(defn["name"]),
        summary=str(defn["summary"]),
        metadata=defn.get("metadata") or {},
        side_effect=defn.get("side_effect"),
        risk=defn.get("risk"),
    )
    return CatalogTool(
        tool_id=str(defn["tool_id"]),
        name=str(defn["name"]),
        summary=str(defn["summary"]),
        provider="native",
        provider_tool_id=str(defn["tool_id"]),
        provider_app_id=defn.get("provider_app_id"),
        risk=str(risk_fields["risk"]),
        side_effect=bool(risk_fields["side_effect"]),
        auth_type=str(defn.get("auth_type") or "none"),
        connection_required=bool(defn.get("connection_required", False)),
        approval_mode=str(risk_fields["approval_mode"]),
        keywords=list(defn.get("keywords") or []),
        categories=list(defn.get("categories") or []),
        input_schema=dict(defn.get("input_schema") or _EMPTY_SCHEMA),
        version="1",
        metadata=dict(defn.get("metadata") or {}),
    )


NATIVE_TOOLS: list[CatalogTool] = [_to_catalog(d) for d in _NATIVE_DEFS]
_NATIVE_BY_ID: dict[str, CatalogTool] = {t.tool_id: t for t in NATIVE_TOOLS}


class NativeToolProvider:
    """Wraps built-in runtime tools and Google connector helpers."""

    name = "native"

    async def search_apps(self, query: str, *, limit: int = 20) -> list[dict[str, Any]]:
        apps = [
            {
                "app_id": "google",
                "name": "Google",
                "summary": "Gmail and Google Calendar tools.",
            },
            {
                "app_id": "stack32",
                "name": "Stack32 Built-ins",
                "summary": "Native research and utility tools.",
            },
        ]
        q = query.strip().lower()
        if not q:
            return apps[:limit]
        return [a for a in apps if q in a["name"].lower() or q in a["summary"].lower()][:limit]

    async def search_tools(self, query: str, *, limit: int = 20) -> list[CatalogTool]:
        q = query.strip().lower()
        if not q:
            return NATIVE_TOOLS[:limit]
        scored: list[tuple[float, CatalogTool]] = []
        for tool in NATIVE_TOOLS:
            hay = f"{tool.name} {tool.summary} {' '.join(tool.keywords)}".lower()
            score = sum(2.0 if t in tool.keywords else (1.0 if t in hay else 0.0) for t in q.split())
            if score > 0 or q in tool.tool_id:
                scored.append((score + (5.0 if q in tool.tool_id else 0.0), tool))
        scored.sort(key=lambda x: (-x[0], x[1].tool_id))
        return [t for _, t in scored[:limit]]

    async def get_tool(self, tool_id: str) -> CatalogTool | None:
        return _NATIVE_BY_ID.get(tool_id)

    async def get_tool_schema(self, tool_id: str) -> dict[str, Any] | None:
        tool = _NATIVE_BY_ID.get(tool_id)
        if not tool:
            return None
        return {
            "tool_id": tool.tool_id,
            "input_schema": tool.input_schema,
            "version": tool.version,
        }

    async def get_auth_requirement(self, tool_id: str) -> dict[str, Any]:
        tool = _NATIVE_BY_ID.get(tool_id)
        if not tool:
            return {"auth_type": "none", "connection_required": False}
        return {
            "auth_type": tool.auth_type,
            "connection_required": tool.connection_required,
            "provider_app_id": tool.provider_app_id,
        }

    async def list_user_connections(
        self, *, user_id: str, app_id: str | None = None
    ) -> list[dict[str, Any]]:
        from agent_service.connections.manager import ConnectionManager

        conns = await ConnectionManager().list_connections(user_id=user_id)
        if app_id:
            return [c for c in conns if c.get("provider") == app_id]
        return conns

    async def start_connection(
        self, *, user_id: str, app_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        from agent_service.integrations.app_keys import oauth_provider_for_app

        if oauth_provider_for_app(app_id) != "google" and app_id != "google":
            return {"error": "UNSUPPORTED_APP", "app_id": app_id}
        from agent_service.connections.manager import ConnectionManager

        return await ConnectionManager().start_google_oauth(
            user_id=user_id,
            agent_id=kwargs.get("agent_id"),
            tool_ids=kwargs.get("tool_ids"),
        )

    async def verify_connection(
        self, *, user_id: str, connection_id: str
    ) -> dict[str, Any]:
        conns = await self.list_user_connections(user_id=user_id)
        match = next((c for c in conns if str(c.get("id")) == connection_id), None)
        if not match:
            return {"ok": False, "connection_id": connection_id}
        return {"ok": True, "connection": match}

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
        # Lazy import avoids circular dependency with tools.runtime → registry.
        from agent_service.tools.runtime import execute_native_tool

        return await execute_native_tool(tool_ref.tool_id, args, context=context)

    async def health_check(self) -> dict[str, Any]:
        return {
            "provider": self.name,
            "ok": True,
            "tool_count": len(NATIVE_TOOLS),
            "degraded": False,
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
