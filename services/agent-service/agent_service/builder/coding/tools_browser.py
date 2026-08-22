"""Browser debugging tools (Playwright in isolated E2B) — flag-gated."""

from __future__ import annotations

from typing import Any

from agent_service.builder.coding.tools import CodingTool, ToolContext, _obj


async def _browser_navigate(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    url = str(args.get("url") or "").strip()
    if not url:
        return {"error": "url required"}
    allowed_hosts = ("localhost", "127.0.0.1", "stack32.dev", "vercel.app")
    from urllib.parse import urlparse

    host = urlparse(url).hostname or ""
    if not any(host == h or host.endswith(f".{h}") for h in allowed_hosts):
        return {"error": "URL host not in browser allowlist", "host": host}
    # Stub: real Playwright wiring lives in E2B browser mode.
    return {"ok": True, "url": url, "note": "Browser sandbox stub — enable BUILDER_BROWSER_DEBUG_ENABLED for Playwright."}


async def _browser_screenshot(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return {"ok": True, "path": args.get("path", "screenshot.png"), "stub": True}


def browser_tools() -> list[CodingTool]:
    return [
        CodingTool(
            "browser.navigate", "browser", "Navigate to an allowlisted URL in isolated browser.",
            _obj({"url": {"type": "string"}}, ["url"]),
            "high", _browser_navigate,
        ),
        CodingTool(
            "browser.screenshot", "browser", "Capture a screenshot of the current page.",
            _obj({"path": {"type": "string"}}, []),
            "medium", _browser_screenshot,
        ),
    ]
