"""Stack32 tool/connector catalog with just-in-time schema loading (M-E).

The Builder must not expose hundreds of tool schemas to the LLM at once. It
searches the catalog for relevant tools (summaries only), then loads the full
schema of a chosen tool version on demand. Backed by the `tool_definitions` /
`tool_versions` / `connector_definitions` tables, with a built-in fallback so
the feature works without a database (local dev, tests).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from agent_service.supabase_client import get_supabase_admin_client

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class CatalogTool:
    id: str
    namespace: str
    name: str
    summary: str
    risk: str
    side_effect: bool
    connector_id: str | None
    keywords: list[str] = field(default_factory=list)
    latest_version: int = 1

    def brief(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "namespace": self.namespace,
            "name": self.name,
            "summary": self.summary,
            "risk": self.risk,
            "side_effect": self.side_effect,
            "connector": self.connector_id,
        }


# Built-in fallback mirrors the seeded catalog so discovery works offline.
_BUILTIN: list[CatalogTool] = [
    CatalogTool("web_search", "research", "Web Search", "Search the web for current information.", "low", False, None, ["search", "web", "news", "research"]),
    CatalogTool("fetch_url", "research", "Fetch URL", "Fetch and read a web page.", "low", False, None, ["url", "fetch", "web", "scrape"]),
    CatalogTool("calculator", "utility", "Calculator", "Evaluate arithmetic expressions.", "low", False, None, ["math", "calculate", "arithmetic"]),
    CatalogTool("current_datetime", "utility", "Current Date/Time", "Get the current UTC datetime.", "low", False, None, ["time", "date", "now", "clock"]),
    CatalogTool("knowledge_search", "knowledge", "Knowledge Search", "Search the agent knowledge base (RAG).", "low", False, None, ["knowledge", "rag", "documents", "retrieval"]),
    CatalogTool("gmail_send", "email", "Gmail Send", "Send an email via Gmail.", "high", True, "google", ["email", "gmail", "send", "mail"]),
    CatalogTool("calendar_create_event", "calendar", "Create Calendar Event", "Create a Google Calendar event.", "high", True, "google", ["calendar", "event", "appointment", "schedule", "meeting"]),
    CatalogTool("slack_post_message", "chat", "Slack Post Message", "Post a message to a Slack channel.", "high", True, "slack", ["slack", "message", "chat", "notify"]),
]

_BUILTIN_SCHEMAS: dict[str, dict[str, Any]] = {
    "web_search": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
    "fetch_url": {"type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"]},
    "calculator": {"type": "object", "properties": {"expression": {"type": "string"}}, "required": ["expression"]},
    "current_datetime": {"type": "object", "properties": {}, "required": []},
    "knowledge_search": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
    "gmail_send": {"type": "object", "properties": {"to": {"type": "string"}, "subject": {"type": "string"}, "body": {"type": "string"}}, "required": ["to", "subject", "body"]},
    "calendar_create_event": {"type": "object", "properties": {"title": {"type": "string"}, "start": {"type": "string"}, "end": {"type": "string"}}, "required": ["title", "start", "end"]},
    "slack_post_message": {"type": "object", "properties": {"channel": {"type": "string"}, "text": {"type": "string"}}, "required": ["channel", "text"]},
}


def _score(tool: CatalogTool, terms: list[str]) -> float:
    hay = f"{tool.name} {tool.summary} {' '.join(tool.keywords)} {tool.namespace}".lower()
    return sum(2.0 if t in tool.keywords else (1.0 if t in hay else 0.0) for t in terms)


async def _load_from_db() -> list[CatalogTool] | None:
    try:
        async with get_supabase_admin_client() as client:
            resp = await client.get(
                "/tool_definitions",
                params={"enabled": "eq.true", "select": "id,namespace,name,summary,risk,side_effect,connector_id,keywords,latest_version"},
            )
        if resp.status_code >= 400:
            return None
        rows = resp.json()
        if not rows:
            return None
        return [
            CatalogTool(
                id=r["id"], namespace=r["namespace"], name=r["name"], summary=r.get("summary", ""),
                risk=r.get("risk", "low"), side_effect=bool(r.get("side_effect")),
                connector_id=r.get("connector_id"), keywords=list(r.get("keywords") or []),
                latest_version=int(r.get("latest_version", 1)),
            )
            for r in rows
        ]
    except Exception:  # noqa: BLE001
        return None


async def search_tool_catalog(query: str, *, limit: int = 6) -> list[dict[str, Any]]:
    """Return brief summaries of catalog tools relevant to `query` (no schemas)."""
    tools = await _load_from_db() or _BUILTIN
    terms = [t for t in query.lower().replace(",", " ").split() if len(t) > 1]
    scored = sorted(tools, key=lambda tl: _score(tl, terms), reverse=True)
    top = [t for t in scored if _score(t, terms) > 0][:limit]
    if not top:
        top = scored[:limit]
    return [t.brief() for t in top]


async def get_tool_schema(tool_id: str, *, version: int | None = None) -> dict[str, Any] | None:
    """Load a specific tool version's full input schema on demand (JIT)."""
    try:
        async with get_supabase_admin_client() as client:
            params = {"tool_id": f"eq.{tool_id}", "select": "version,input_schema", "order": "version.desc", "limit": "1"}
            if version is not None:
                params = {"tool_id": f"eq.{tool_id}", "version": f"eq.{version}", "select": "version,input_schema", "limit": "1"}
            resp = await client.get("/tool_versions", params=params)
        if resp.status_code < 400 and resp.json():
            row = resp.json()[0]
            return {"tool_id": tool_id, "version": row["version"], "input_schema": row["input_schema"]}
    except Exception:  # noqa: BLE001
        pass
    schema = _BUILTIN_SCHEMAS.get(tool_id)
    if schema is not None:
        return {"tool_id": tool_id, "version": version or 1, "input_schema": schema}
    return None
