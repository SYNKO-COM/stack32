"""Select generated-agent runtime implementation behind AGENT_RUNTIME_VERSION."""

from __future__ import annotations

from typing import Any, Protocol

from agent_service.config import get_settings


class AgentRuntime(Protocol):
    async def execute(
        self,
        *,
        run_id: str,
        user_id: str,
        agent_id: str,
        thread_id: str,
        content: str,
    ) -> dict[str, Any]: ...


def use_langgraph_runtime() -> bool:
    return get_settings().AGENT_RUNTIME_VERSION == "langgraph"
