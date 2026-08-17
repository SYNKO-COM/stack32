"""Provider registry — resolve tools across native / Pipedream / custom_api."""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from agent_service.integrations.custom_api import CustomApiToolProvider
from agent_service.integrations.native import NativeToolProvider
from agent_service.integrations.normalize import CatalogTool, ToolRef
from agent_service.integrations.pipedream import PipedreamToolProvider
from agent_service.integrations.protocol import ToolProvider

logger = logging.getLogger(__name__)


class ProviderRegistry:
    """Registers hybrid providers and resolves ToolRef by catalog tool_id."""

    def __init__(self) -> None:
        self._providers: dict[str, ToolProvider] = {}
        self.register(NativeToolProvider())
        self.register(PipedreamToolProvider())
        self.register(CustomApiToolProvider())

    def register(self, provider: ToolProvider) -> None:
        self._providers[provider.name] = provider

    def get_provider(self, name: str) -> ToolProvider | None:
        return self._providers.get(name)

    def list_providers(self) -> list[str]:
        return sorted(self._providers)

    async def resolve_tool_ref(self, tool_id: str) -> ToolRef | None:
        """Resolve a tool_id to a ToolRef by probing providers (native first)."""
        if not tool_id:
            return None
        # Explicit provider prefixes.
        if tool_id.startswith("pd:") or tool_id.startswith("pipedream:"):
            provider = self.get_provider("pipedream")
            if not provider:
                return None
            tool = await provider.get_tool(tool_id)
            if not tool:
                return ToolRef(
                    tool_id=tool_id,
                    provider="pipedream",
                    provider_tool_id=tool_id.removeprefix("pd:").removeprefix("pipedream:"),
                )
            return ToolRef(
                tool_id=tool.tool_id,
                provider=tool.provider,
                provider_tool_id=tool.provider_tool_id,
                provider_app_id=tool.provider_app_id,
                version=tool.version,
            )

        order = ("native", "custom_api", "pipedream")
        for name in order:
            provider = self._providers.get(name)
            if not provider:
                continue
            tool = await provider.get_tool(tool_id)
            if tool:
                return ToolRef(
                    tool_id=tool.tool_id,
                    provider=tool.provider,
                    provider_tool_id=tool.provider_tool_id,
                    provider_app_id=tool.provider_app_id,
                    version=tool.version,
                )
        return None

    async def get_tool(self, tool_id: str) -> CatalogTool | None:
        ref = await self.resolve_tool_ref(tool_id)
        if not ref:
            return None
        provider = self.get_provider(ref.provider)
        if not provider:
            return None
        return await provider.get_tool(ref.tool_id)

    async def search_tools(self, query: str, *, limit: int = 20) -> list[CatalogTool]:
        scored: list[CatalogTool] = []
        per_provider = max(5, limit)
        for name in ("native", "custom_api", "pipedream"):
            provider = self._providers.get(name)
            if not provider:
                continue
            try:
                tools = await provider.search_tools(query, limit=per_provider)
            except Exception:  # noqa: BLE001
                logger.exception("provider_search_failed provider=%s", name)
                continue
            scored.extend(tools)
        # Deduplicate by tool_id preserving order (native preferred).
        seen: set[str] = set()
        out: list[CatalogTool] = []
        for tool in scored:
            if tool.tool_id in seen:
                continue
            seen.add(tool.tool_id)
            out.append(tool)
            if len(out) >= limit:
                break
        return out

    async def search(self, query: str, *, limit: int = 20) -> list[CatalogTool]:
        """Alias for search_tools — used by builder capability resolution."""
        return await self.search_tools(query, limit=limit)

    async def search_apps(self, query: str, *, limit: int = 20) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for provider in self._providers.values():
            try:
                apps = await provider.search_apps(query, limit=limit)
            except Exception:  # noqa: BLE001
                logger.exception("provider_app_search_failed provider=%s", provider.name)
                continue
            for app in apps:
                row = dict(app)
                row.setdefault("provider", provider.name)
                out.append(row)
                if len(out) >= limit:
                    # region agent log
                    try:
                        import json
                        from pathlib import Path

                        Path("/Users/3van/Documents/Stack32/.cursor/debug-faa28e.log").open("a").write(
                            json.dumps(
                                {
                                    "sessionId": "faa28e",
                                    "runId": "pre-verify",
                                    "hypothesisId": "D",
                                    "location": "registry.py:search_apps:early-return",
                                    "message": "app search hit limit",
                                    "data": {
                                        "q": query,
                                        "limit": limit,
                                        "count": len(out),
                                        "ids": [str(a.get("app_id")) for a in out[:10]],
                                        "providers": [str(a.get("provider")) for a in out[:10]],
                                    },
                                    "timestamp": int(__import__("time").time() * 1000),
                                }
                            )
                            + "\n"
                        )
                    except Exception:
                        pass
                    # endregion
                    return out
        # region agent log
        try:
            import json
            from pathlib import Path

            Path("/Users/3van/Documents/Stack32/.cursor/debug-faa28e.log").open("a").write(
                json.dumps(
                    {
                        "sessionId": "faa28e",
                        "runId": "pre-verify",
                        "hypothesisId": "D",
                        "location": "registry.py:search_apps",
                        "message": "merged app search",
                        "data": {
                            "q": query,
                            "count": len(out),
                            "ids": [str(a.get("app_id")) for a in out[:10]],
                            "providers": [str(a.get("provider")) for a in out[:10]],
                        },
                        "timestamp": int(__import__("time").time() * 1000),
                    }
                )
                + "\n"
            )
        except Exception:
            pass
        # endregion
        return out

    async def health(self) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for name, provider in self._providers.items():
            try:
                results.append(await provider.health_check())
            except Exception as exc:  # noqa: BLE001
                logger.exception("provider_health_failed provider=%s", name)
                results.append(
                    {
                        "provider": name,
                        "ok": False,
                        "degraded": True,
                        "message": str(exc),
                    }
                )
        return results

    async def execute_tool(
        self,
        tool_id: str,
        args: dict[str, Any],
        *,
        context: dict[str, Any] | None = None,
        provider_hint: str | None = None,
    ) -> dict[str, Any]:
        if provider_hint and provider_hint in self._providers:
            provider = self._providers[provider_hint]
            ref = ToolRef(tool_id=tool_id, provider=provider_hint)
            tool = await provider.get_tool(tool_id)
            if tool:
                ref = ToolRef(
                    tool_id=tool.tool_id,
                    provider=tool.provider,
                    provider_tool_id=tool.provider_tool_id,
                    provider_app_id=tool.provider_app_id,
                    version=tool.version,
                )
            return await provider.execute_tool(ref, args, context=context)

        ref = await self.resolve_tool_ref(tool_id)
        if not ref:
            raise KeyError(tool_id)
        provider = self.get_provider(ref.provider)
        if not provider:
            raise KeyError(tool_id)
        return await provider.execute_tool(ref, args, context=context)


@lru_cache
def get_provider_registry() -> ProviderRegistry:
    return ProviderRegistry()
