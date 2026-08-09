"""Custom API tool provider — allowlisted HTTP requests with SSRF protection."""

from __future__ import annotations

import logging
from typing import Any

import httpx
from pydantic import BaseModel, Field, ValidationError

from agent_service.integrations.normalize import CatalogTool, ToolRef
from agent_service.security.ssrf import UnsafeURLError, validate_public_http_url

logger = logging.getLogger(__name__)

_MAX_RESPONSE_BYTES = 200_000
_MAX_TEXT_CHARS = 20_000
_DEFAULT_TIMEOUT = 20.0

HTTP_REQUEST_TOOL = CatalogTool(
    tool_id="http_request",
    name="HTTP Request",
    summary="Call an allowlisted custom HTTP API.",
    provider="custom_api",
    provider_tool_id="http_request",
    provider_app_id=None,
    risk="high",
    side_effect=True,
    auth_type="api_key",
    connection_required=False,
    approval_mode="always",
    keywords=["http", "api", "custom", "webhook"],
    categories=["custom"],
    input_schema={
        "type": "object",
        "properties": {
            "url": {"type": "string"},
            "method": {"type": "string"},
            "headers": {"type": "object"},
            "body": {"type": "string"},
            "timeout_seconds": {"type": "number"},
        },
        "required": ["url"],
    },
    version="1",
)


class HttpRequestInput(BaseModel):
    url: str = Field(min_length=8, max_length=2000)
    method: str = Field(default="GET", max_length=16)
    headers: dict[str, str] = Field(default_factory=dict)
    body: str | None = Field(default=None, max_length=100_000)
    timeout_seconds: float = Field(default=_DEFAULT_TIMEOUT, ge=1.0, le=60.0)


class CustomApiToolProvider:
    name = "custom_api"

    async def search_apps(self, query: str, *, limit: int = 20) -> list[dict[str, Any]]:
        q = query.strip().lower()
        app = {
            "app_id": "custom_api",
            "name": "Custom API",
            "summary": "User-configured HTTP endpoints.",
        }
        if not q or q in app["name"].lower() or q in app["summary"].lower():
            return [app][:limit]
        return []

    async def search_tools(self, query: str, *, limit: int = 20) -> list[CatalogTool]:
        q = query.strip().lower()
        if not q or q in HTTP_REQUEST_TOOL.tool_id or any(
            q in k for k in HTTP_REQUEST_TOOL.keywords
        ):
            return [HTTP_REQUEST_TOOL][:limit]
        hay = f"{HTTP_REQUEST_TOOL.name} {HTTP_REQUEST_TOOL.summary}".lower()
        if q in hay:
            return [HTTP_REQUEST_TOOL][:limit]
        return []

    async def get_tool(self, tool_id: str) -> CatalogTool | None:
        if tool_id == "http_request":
            return HTTP_REQUEST_TOOL
        return None

    async def get_tool_schema(self, tool_id: str) -> dict[str, Any] | None:
        if tool_id != "http_request":
            return None
        return {
            "tool_id": "http_request",
            "input_schema": HTTP_REQUEST_TOOL.input_schema,
            "version": HTTP_REQUEST_TOOL.version,
        }

    async def get_auth_requirement(self, tool_id: str) -> dict[str, Any]:
        return {
            "auth_type": "api_key",
            "connection_required": False,
            "optional_secret": True,
        }

    async def list_user_connections(
        self, *, user_id: str, app_id: str | None = None
    ) -> list[dict[str, Any]]:
        return []

    async def start_connection(
        self, *, user_id: str, app_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        return {"error": "NOT_APPLICABLE", "provider": self.name}

    async def verify_connection(
        self, *, user_id: str, connection_id: str
    ) -> dict[str, Any]:
        return {"ok": False, "error": "NOT_APPLICABLE"}

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
        if tool_ref.tool_id != "http_request":
            return {"error": "TOOL_NOT_ALLOWED", "tool_id": tool_ref.tool_id}
        context = context or {}
        try:
            inp = HttpRequestInput.model_validate(args)
        except ValidationError:
            return {"error": "TOOL_INPUT_INVALID", "message": "Invalid http_request arguments."}

        try:
            url = validate_public_http_url(inp.url)
        except UnsafeURLError as exc:
            return {"error": "UNSAFE_URL", "message": str(exc)}

        method = inp.method.upper().strip()
        if method not in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"}:
            return {"error": "TOOL_INPUT_INVALID", "message": f"Unsupported method: {method}"}

        headers = {str(k)[:128]: str(v)[:2000] for k, v in list(inp.headers.items())[:40]}
        # Optional secret from runtime context (never from LLM-controlled keys alone).
        secret = context.get("http_request_secret") or context.get("api_key")
        if isinstance(secret, str) and secret and "authorization" not in {
            k.lower() for k in headers
        }:
            headers["Authorization"] = f"Bearer {secret}"

        try:
            async with httpx.AsyncClient(
                timeout=inp.timeout_seconds, follow_redirects=False
            ) as client:
                response = await client.request(
                    method,
                    url,
                    headers=headers or None,
                    content=inp.body.encode("utf-8") if inp.body and method != "GET" else None,
                )
                hops = 0
                while response.is_redirect and hops < 3:
                    loc = response.headers.get("location")
                    if not loc:
                        break
                    url = validate_public_http_url(loc)
                    response = await client.request(method, url, headers=headers or None)
                    hops += 1
                if response.is_redirect:
                    return {"error": "TOOL_FAILED", "message": "Too many redirects."}
                raw = response.content[:_MAX_RESPONSE_BYTES]
                text = raw.decode("utf-8", errors="replace")[:_MAX_TEXT_CHARS]
                return {
                    "url": url,
                    "status_code": response.status_code,
                    "content_type": response.headers.get("content-type", ""),
                    "text": text,
                    "truncated": len(response.content) > _MAX_RESPONSE_BYTES
                    or len(raw.decode("utf-8", errors="replace")) > _MAX_TEXT_CHARS,
                    "untrusted": True,
                }
        except UnsafeURLError as exc:
            return {"error": "UNSAFE_URL", "message": str(exc)}
        except Exception as exc:  # noqa: BLE001
            logger.warning("http_request_failed err=%s", exc)
            return {"error": "TOOL_FAILED", "message": "HTTP request failed."}

    async def health_check(self) -> dict[str, Any]:
        return {"provider": self.name, "ok": True, "degraded": False}

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
