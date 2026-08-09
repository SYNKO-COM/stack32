"""ToolProvider protocol for native / Pipedream / custom API backends."""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from agent_service.integrations.normalize import CatalogTool, ToolRef


@runtime_checkable
class ToolProvider(Protocol):
    """Provider-agnostic surface used by ProviderRegistry and readiness."""

    name: str

    async def search_apps(self, query: str, *, limit: int = 20) -> list[dict[str, Any]]: ...

    async def search_tools(self, query: str, *, limit: int = 20) -> list[CatalogTool]: ...

    async def get_tool(self, tool_id: str) -> CatalogTool | None: ...

    async def get_tool_schema(self, tool_id: str) -> dict[str, Any] | None: ...

    async def get_auth_requirement(self, tool_id: str) -> dict[str, Any]: ...

    async def list_user_connections(
        self, *, user_id: str, app_id: str | None = None
    ) -> list[dict[str, Any]]: ...

    async def start_connection(
        self, *, user_id: str, app_id: str, **kwargs: Any
    ) -> dict[str, Any]: ...

    async def verify_connection(
        self, *, user_id: str, connection_id: str
    ) -> dict[str, Any]: ...

    async def configure_tool(
        self, tool_ref: ToolRef, config: dict[str, Any]
    ) -> dict[str, Any]: ...

    async def get_dynamic_options(
        self, tool_ref: ToolRef, field: str, *, context: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]: ...

    async def execute_tool(
        self,
        tool_ref: ToolRef,
        args: dict[str, Any],
        *,
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]: ...

    async def health_check(self) -> dict[str, Any]: ...

    # Trigger stubs — optional for M7; default empty implementations expected.

    async def search_triggers(self, query: str, *, limit: int = 20) -> list[dict[str, Any]]: ...

    async def deploy_trigger(
        self, *, user_id: str, trigger_id: str, config: dict[str, Any] | None = None
    ) -> dict[str, Any]: ...

    async def list_triggers(self, *, user_id: str) -> list[dict[str, Any]]: ...

    async def delete_trigger(self, *, user_id: str, trigger_id: str) -> dict[str, Any]: ...
