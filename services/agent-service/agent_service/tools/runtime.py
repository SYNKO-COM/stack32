"""Trusted tool runtime — hybrid provider registry + native builtins."""

from __future__ import annotations

import ast
import logging
import operator
from collections.abc import Iterable
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


class CalendarCreateEventInput(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    start: str = Field(min_length=1, max_length=64)
    end: str = Field(min_length=1, max_length=64)
    description: str = Field(default="", max_length=10_000)
    dry_run: bool = True

    @classmethod
    def model_validate(cls, obj: Any, **kwargs: Any) -> CalendarCreateEventInput:  # type: ignore[override]
        if isinstance(obj, dict):
            data = dict(obj)
            if not data.get("title") and data.get("summary"):
                data["title"] = data["summary"]
            if not data.get("start"):
                data["start"] = data.get("start_time") or data.get("startTime") or data.get("begin")
            if not data.get("end"):
                data["end"] = data.get("end_time") or data.get("endTime") or data.get("finish")
            # If end missing, default +1h from start (string passthrough; normalize later).
            if data.get("start") and not data.get("end"):
                data["end"] = data["start"]
            obj = data
        return super().model_validate(obj, **kwargs)


class GoogleDocsCreateInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=50_000)
    dry_run: bool = True


class GoogleDocsAppendInput(BaseModel):
    document_id: str = Field(min_length=1, max_length=128)
    text: str = Field(min_length=1, max_length=50_000)
    dry_run: bool = True


# Tools that mutate external state: default to dry-run and require explicit approval
# before a real (non-dry-run) execution is permitted.
SIDE_EFFECT_TOOLS = frozenset(
    {
        "gmail_send",
        "gmail_send_message",
        "gmail_create_draft",
        "calendar_create_event",
        "google_docs_create",
        "google_docs_append",
        "slack_post_message",
        "http_request",
    }
)

_GOOGLE_TOOLS = frozenset(
    {
        "gmail_list",
        "gmail_read",
        "gmail_send",
        "gmail_create_draft",
        "gmail_send_message",
        "calendar_list",
        "calendar_create_event",
        "google_docs_create",
        "google_docs_append",
    }
)

_GOOGLE_TOOL_APPS = {
    "gmail_list": "gmail",
    "gmail_read": "gmail",
    "gmail_send": "gmail",
    "gmail_create_draft": "gmail",
    "gmail_send_message": "gmail",
    "calendar_list": "google_calendar",
    "calendar_create_event": "google_calendar",
    "google_docs_create": "google_docs",
    "google_docs_append": "google_docs",
}


async def native_google_tools_to_hide(
    tool_ids: Iterable[str], *, user_id: str, agent_id: str
) -> set[str]:
    """Native Google tools that must not be offered to the model.

    These call the Google API directly with an OAuth access token. An account
    connected through Pipedream Connect never yields one: Pipedream's managed
    OAuth does not export raw credentials, so ``list_accounts`` comes back with
    ``credentials: None`` and the tool can only ever answer CONNECTION_REQUIRED.

    Offering them anyway is worse than not having them. The model reaches for
    ``gmail_list`` long before ``pd:gmail-list-thread-messages``, so the run
    dead-ends asking the user to connect an account they already connected.

    Only hide a tool when the same app is genuinely covered otherwise: the user
    holds a Pipedream account for it *and* the spec enables Pipedream actions
    for it. With nothing connected at all, the native tool stays — its
    "connect your account" prompt is then the right answer.
    """
    from agent_service.integrations.app_keys import app_key_from_tool_id

    ids = [str(t) for t in tool_ids]
    candidates = {t for t in ids if t in _GOOGLE_TOOL_APPS}
    if not candidates:
        return set()

    covered_apps = {
        app_key_from_tool_id(t) for t in ids if t.startswith("pd:")
    }
    apps_at_stake = {
        _GOOGLE_TOOL_APPS[t] for t in candidates if _GOOGLE_TOOL_APPS[t] in covered_apps
    }
    if not apps_at_stake:
        return set()

    from agent_service.integrations.pipedream.accounts import (
        resolve_pipedream_auth_for_tool,
    )

    connected: set[str] = set()
    for app in apps_at_stake:
        try:
            auth = await resolve_pipedream_auth_for_tool(
                user_id=user_id, agent_id=agent_id, tool_id="", app_id=app
            )
        except Exception:  # noqa: BLE001 - a lookup failure must not drop tools
            logger.warning("pipedream_account_lookup_failed app=%s", app, exc_info=True)
            continue
        if auth:
            connected.add(app)

    return {t for t in candidates if _GOOGLE_TOOL_APPS[t] in connected}


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


def _is_approved(tool_id: str, context: dict[str, Any]) -> bool:
    approved = context.get("approved_tool_ids") or []
    return tool_id in set(approved)


async def execute_native_tool(
    tool_id: str,
    args: dict[str, Any],
    *,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Execute a built-in native / Google connector tool (no registry hop)."""
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
            from agent_service.runtime.datetime_context import current_datetime_snapshot

            tz = None
            if isinstance(context, dict):
                tz = context.get("timezone") or context.get("schedule_timezone")
            return current_datetime_snapshot(
                str(tz) if tz else None
            )
        if tool_id == "structured_output":
            payload = StructuredOutputInput.model_validate(args)
            if len(str(payload.data)) > 50_000:
                raise ToolError("TOOL_INPUT_INVALID", "Payload too large.")
            return {"schema_name": payload.schema_name, "data": payload.data}
        if tool_id in _GOOGLE_TOOLS:
            return await _execute_google_tool(tool_id, args, context=context)
        if tool_id == "http_request":
            # Prefer custom_api provider; keep a thin fallback for direct native calls.
            from agent_service.integrations.custom_api import CustomApiToolProvider
            from agent_service.integrations.normalize import ToolRef

            return await CustomApiToolProvider().execute_tool(
                ToolRef(tool_id="http_request", provider="custom_api"),
                args,
                context=context,
            )
        raise ToolError("TOOL_NOT_ALLOWED", f"Tool not allowed: {tool_id}")
    except ValidationError as exc:
        raise ToolError("TOOL_INPUT_INVALID", "Invalid tool arguments.") from exc


async def execute_tool(
    tool_id: str,
    args: dict[str, Any],
    *,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Resolve via ProviderRegistry when possible; fall back to native execution."""
    context = dict(context or {})
    try:
        from agent_service.integrations.registry import get_provider_registry

        registry = get_provider_registry()
        ref = await registry.resolve_tool_ref(tool_id)
        if ref is not None:
            provider = registry.get_provider(ref.provider)
            if provider is not None:
                if ref.provider == "native":
                    return await execute_native_tool(tool_id, args, context=context)
                if ref.provider == "pipedream":
                    user_id = str(context.get("user_id") or "")
                    agent_id = str(context.get("agent_id") or "")
                    installation_id = context.get("installation_id")
                    preloaded = context.get("tool_configs")
                    if isinstance(preloaded, dict) and tool_id in preloaded:
                        context["tool_config"] = preloaded[tool_id]
                    elif context.get("tool_config") is None and user_id and agent_id:
                        from agent_service.integrations.pipedream.tool_config import (
                            resolve_effective_tool_config,
                        )

                        binding_cfg: dict[str, Any] | None = None
                        spec_tools = context.get("spec_tools")
                        if isinstance(spec_tools, list):
                            for item in spec_tools:
                                if isinstance(item, dict) and item.get("tool_id") == tool_id:
                                    cfg = item.get("config")
                                    binding_cfg = dict(cfg) if isinstance(cfg, dict) else None
                                    break
                        context["tool_config"] = await resolve_effective_tool_config(
                            user_id=user_id,
                            agent_id=agent_id,
                            tool_id=tool_id,
                            binding_config=binding_cfg,
                            installation_id=str(installation_id)
                            if installation_id
                            else None,
                            app_id=ref.provider_app_id,
                        )
                    if user_id and agent_id and not context.get("auth_provision_id"):
                        from agent_service.integrations.pipedream.accounts import (
                            resolve_pipedream_auth_for_tool,
                        )

                        auth = await resolve_pipedream_auth_for_tool(
                            user_id=user_id,
                            agent_id=agent_id,
                            tool_id=tool_id,
                            app_id=ref.provider_app_id,
                        )
                        if auth:
                            context["auth_provision_id"] = auth["auth_provision_id"]
                            context["connection_id"] = auth.get("connection_id")
                    # Pipedream side-effects require approval unless already approved.
                    if _requires_pipedream_approval(tool_id, ref) and not _is_approved(
                        tool_id, context
                    ):
                        return {
                            "error": "APPROVAL_REQUIRED",
                            "approval_required": True,
                            "tool_id": tool_id,
                            "provider": "pipedream",
                            "app_id": ref.provider_app_id,
                            "message": "This action needs your approval before it runs.",
                            "preview_args": {
                                k: v
                                for k, v in (args or {}).items()
                                if k
                                not in {
                                    "auth_provision_id",
                                    "authProvisionId",
                                    "configured_props",
                                }
                            },
                        }
                return await provider.execute_tool(ref, args, context=context)
    except ToolError:
        raise
    except Exception:  # noqa: BLE001
        logger.debug("registry_execute_fallback tool_id=%s", tool_id, exc_info=True)

    return await execute_native_tool(tool_id, args, context=context)


def _requires_pipedream_approval(tool_id: str, ref: Any) -> bool:
    # Runtime Approve/Deny is disabled by default — connecting the account is
    # the authorization gate. LangGraph may still inject approved_tool_ids.
    del tool_id, ref
    return False


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
    if tool_id == "calendar_create_event":
        inp = CalendarCreateEventInput.model_validate(args)
        approved = _is_approved(tool_id, context)
        effective_dry_run = inp.dry_run or not approved
        result = await google_tools.calendar_create_event(
            user_id=user_id,
            agent_id=agent_id,
            title=inp.title,
            start=inp.start,
            end=inp.end,
            description=inp.description,
            dry_run=effective_dry_run,
        )
        if effective_dry_run and not inp.dry_run and not approved:
            result["approval_required"] = True
            result["message"] = "Real create requires human approval; returned dry-run preview."
        return result
    if tool_id == "gmail_create_draft":
        inp = GmailSendInput.model_validate(args)
        approved = _is_approved(tool_id, context)
        # Draft creation is a side-effect; still respect approval + dry_run.
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
            result["message"] = "Draft create requires human approval; returned dry-run preview."
        return result
    if tool_id == "gmail_send_message":
        inp = GmailSendInput.model_validate(args)
        approved = _is_approved(tool_id, context)
        effective_dry_run = inp.dry_run or not approved
        result = await google_tools.gmail_send_message(
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
    if tool_id == "gmail_send":
        # Legacy alias: prefer draft path for backward compatibility.
        # Docs: gmail_send creates a draft (via gmail_send_draft); use
        # gmail_send_message for an actual send when approved.
        inp = GmailSendInput.model_validate(args)
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
    if tool_id == "google_docs_create":
        inp = GoogleDocsCreateInput.model_validate(args)
        approved = _is_approved(tool_id, context)
        effective_dry_run = inp.dry_run or not approved
        result = await google_tools.google_docs_create(
            user_id=user_id,
            agent_id=agent_id,
            title=inp.title,
            body=inp.body,
            dry_run=effective_dry_run,
        )
        if effective_dry_run and not inp.dry_run and not approved:
            result["approval_required"] = True
            result["message"] = "Creating a Doc requires approval; returned dry-run preview."
        return result
    if tool_id == "google_docs_append":
        inp = GoogleDocsAppendInput.model_validate(args)
        approved = _is_approved(tool_id, context)
        effective_dry_run = inp.dry_run or not approved
        result = await google_tools.google_docs_append(
            user_id=user_id,
            agent_id=agent_id,
            document_id=inp.document_id,
            text=inp.text,
            dry_run=effective_dry_run,
        )
        if effective_dry_run and not inp.dry_run and not approved:
            result["approval_required"] = True
            result["message"] = "Updating a Doc requires approval; returned dry-run preview."
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
    from urllib.parse import urlparse

    import httpx

    raw_url = (inp.url or "").strip()
    host = (urlparse(raw_url).hostname or "").lower()
    path = (urlparse(raw_url).path or "").lower()
    # Google Maps / Google listing HTML scrapes fail (redirects / blocks) and cause
    # Live TOOL_FAILED loops — force the agent toward Maps API actions instead.
    maps_host = (
        host.endswith("google.com")
        and ("maps" in host or path.startswith("/maps") or "maps" in path)
    ) or host.endswith("maps.google.com") or host.endswith("goo.gl") or host.endswith(
        "maps.app.goo.gl"
    )
    if maps_host or "google.com/maps" in raw_url.lower():
        raise ToolError(
            "FETCH_URL_GOOGLE_BLOCKED",
            "Do not scrape Google Maps HTML with fetch_url. Use google_maps_platform "
            "search-places / get-place-details instead.",
        )

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
