"""Trusted tool runtime — allowlisted tools only."""

from __future__ import annotations

import ast
import logging
import operator
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from agent_service.security.ssrf import validate_public_http_url

logger = logging.getLogger(__name__)


class ToolError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


class WebSearchInput(BaseModel):
    query: str = Field(min_length=1, max_length=500)


class FetchUrlInput(BaseModel):
    url: str = Field(min_length=8, max_length=2000)


class KnowledgeSearchInput(BaseModel):
    query: str = Field(min_length=1, max_length=1000)


class CalculatorInput(BaseModel):
    expression: str = Field(min_length=1, max_length=200)


class StructuredOutputInput(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)
    schema_name: str = Field(default="generic", max_length=64)


class GmailListInput(BaseModel):
    query: str = Field(default="", max_length=500)
    max_results: int = Field(default=10, ge=1, le=25)


class GmailReadInput(BaseModel):
    message_id: str = Field(min_length=1, max_length=128)


class GmailSendInput(BaseModel):
    to: str = Field(min_length=3, max_length=500)
    subject: str = Field(default="", max_length=500)
    body: str = Field(default="", max_length=50_000)
    dry_run: bool = True


class CalendarListInput(BaseModel):
    max_results: int = Field(default=10, ge=1, le=25)


# Tools that mutate external state: default to dry-run and require explicit approval
# before a real (non-dry-run) execution is permitted.
SIDE_EFFECT_TOOLS = frozenset({"gmail_send"})


_SAFE_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.Mod: operator.mod,
}


def _safe_eval(expr: str) -> float:
    node = ast.parse(expr, mode="eval")

    def _eval(n: ast.AST) -> float:
        if isinstance(n, ast.Expression):
            return _eval(n.body)
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            return float(n.value)
        if isinstance(n, ast.BinOp) and type(n.op) in _SAFE_OPS:
            return _SAFE_OPS[type(n.op)](_eval(n.left), _eval(n.right))
        if isinstance(n, ast.UnaryOp) and type(n.op) in _SAFE_OPS:
            return _SAFE_OPS[type(n.op)](_eval(n.operand))
        raise ToolError("TOOL_INPUT_INVALID", "Unsafe or unsupported expression.")

    return _eval(node)


async def execute_tool(
    tool_id: str,
    args: dict[str, Any],
    *,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    context = context or {}
    try:
        if tool_id == "web_search":
            return await _web_search(WebSearchInput.model_validate(args))
        if tool_id == "fetch_url":
            return await _fetch_url(FetchUrlInput.model_validate(args))
        if tool_id == "knowledge_search":
            return await _knowledge_search(
                KnowledgeSearchInput.model_validate(args),
                context=context,
            )
        if tool_id == "calculator":
            value = _safe_eval(CalculatorInput.model_validate(args).expression)
            return {"value": value}
        if tool_id == "current_datetime":
            return {"iso": datetime.now(UTC).isoformat(), "timezone": "UTC"}
        if tool_id == "structured_output":
            payload = StructuredOutputInput.model_validate(args)
            if len(str(payload.data)) > 50_000:
                raise ToolError("TOOL_INPUT_INVALID", "Payload too large.")
            return {"schema_name": payload.schema_name, "data": payload.data}
        if tool_id in {"gmail_list", "gmail_read", "gmail_send", "calendar_list"}:
            return await _execute_google_tool(tool_id, args, context=context)
        raise ToolError("TOOL_NOT_ALLOWED", f"Tool not allowed: {tool_id}")
    except ValidationError as exc:
        raise ToolError("TOOL_INPUT_INVALID", "Invalid tool arguments.") from exc


def _is_approved(tool_id: str, context: dict[str, Any]) -> bool:
    approved = context.get("approved_tool_ids") or []
    return tool_id in set(approved)


async def _execute_google_tool(
    tool_id: str, args: dict[str, Any], *, context: dict[str, Any]
) -> dict[str, Any]:
    """Dispatch Google connector tools. Credentials resolve inside the connector
    layer from the agent's bindings — never from LLM args or context."""
    from agent_service.connections import google_tools

    user_id = str(context.get("user_id", ""))
    agent_id = str(context.get("agent_id", ""))
    if not user_id or not agent_id:
        raise ToolError("TOOL_CONTEXT_MISSING", "Connector tools require an agent context.")

    if tool_id == "gmail_list":
        inp = GmailListInput.model_validate(args)
        return await google_tools.gmail_list(
            user_id=user_id, agent_id=agent_id, query=inp.query, max_results=inp.max_results
        )
    if tool_id == "gmail_read":
        inp = GmailReadInput.model_validate(args)
        return await google_tools.gmail_read(
            user_id=user_id, agent_id=agent_id, message_id=inp.message_id
        )
    if tool_id == "calendar_list":
        inp = CalendarListInput.model_validate(args)
        return await google_tools.calendar_list(
            user_id=user_id, agent_id=agent_id, max_results=inp.max_results
        )
    if tool_id == "gmail_send":
        inp = GmailSendInput.model_validate(args)
        # Side-effect: force dry-run unless the orchestrator granted approval.
        approved = _is_approved(tool_id, context)
        effective_dry_run = inp.dry_run or not approved
        result = await google_tools.gmail_send_draft(
            user_id=user_id,
            agent_id=agent_id,
            to=inp.to,
            subject=inp.subject,
            body=inp.body,
            dry_run=effective_dry_run,
        )
        if effective_dry_run and not inp.dry_run and not approved:
            result["approval_required"] = True
            result["message"] = "Real send requires human approval; returned dry-run preview."
        return result
    raise ToolError("TOOL_NOT_ALLOWED", f"Tool not allowed: {tool_id}")


async def _web_search(inp: WebSearchInput) -> dict[str, Any]:
    from agent_service.config import get_settings

    settings = get_settings()
    if not settings.WEB_SEARCH_API_KEY:
        # Deterministic degraded response without fabricating sources
        return {
            "results": [],
            "query": inp.query,
            "degraded": True,
            "message": "Search provider not configured.",
        }
    # Tavily-compatible adapter (optional)
    import httpx

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            "https://api.tavily.com/search",
            json={"api_key": settings.WEB_SEARCH_API_KEY, "query": inp.query, "max_results": 5},
        )
    if response.status_code >= 400:
        raise ToolError("TOOL_FAILED", "Search provider error.")
    data = response.json()
    results = [
        {"title": r.get("title"), "url": r.get("url"), "snippet": r.get("content", "")[:500]}
        for r in data.get("results", [])[:5]
    ]
    return {"results": results, "query": inp.query}


async def _fetch_url(inp: FetchUrlInput) -> dict[str, Any]:
    import httpx

    url = validate_public_http_url(inp.url)
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
        response = await client.get(url)
        # Revalidate redirects manually
        hops = 0
        while response.is_redirect and hops < 3:
            loc = response.headers.get("location")
            if not loc:
                break
            url = validate_public_http_url(loc)
            response = await client.get(url)
            hops += 1
        if response.is_redirect:
            raise ToolError("TOOL_FAILED", "Too many redirects.")
        content_type = response.headers.get("content-type", "")
        raw = response.content[:200_000]
        text = raw.decode("utf-8", errors="replace")
        return {
            "url": url,
            "status_code": response.status_code,
            "content_type": content_type,
            "text": text[:20_000],
            "untrusted": True,
        }


async def _knowledge_search(inp: KnowledgeSearchInput, *, context: dict[str, Any]) -> dict[str, Any]:
    from agent_service.knowledge.retrieve import retrieve_knowledge

    chunks = await retrieve_knowledge(
        user_id=str(context.get("user_id", "")),
        agent_id=str(context.get("agent_id", "")),
        query=inp.query,
    )
    return {"chunks": chunks, "untrusted": True}
