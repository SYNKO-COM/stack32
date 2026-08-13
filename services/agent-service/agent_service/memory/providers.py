"""MemoryProvider abstraction (M3).

Stack32 ships a default, zero-config memory (``Stack32MemoryProvider``) backed by
Supabase/pgvector. Advanced users may point an agent at their own Postgres/Supabase
instance (``PostgresMemoryProvider``) via an encrypted connection string. Both
providers implement the same protocol so the runtime never special-cases storage.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from agent_service.memory import service as stack32_service


@runtime_checkable
class MemoryProvider(Protocol):
    """Storage-agnostic memory operations used by the runtime."""

    async def read(self, *, user_id: str, agent_id: str, query: str) -> list[dict[str, Any]]:
        ...

    async def write(
        self,
        *,
        user_id: str,
        agent_id: str,
        memory_type: str,
        content: str,
        thread_id: str | None = None,
        retention_days: int | None = None,
        max_memory_items: int | None = None,
    ) -> dict[str, Any] | None:
        ...

    async def cleanup(self, *, agent_id: str | None = None) -> int:
        ...


class Stack32MemoryProvider:
    """Default provider: Supabase pgvector with retention + prune enforcement."""

    name = "stack32"

    async def read(self, *, user_id: str, agent_id: str, query: str) -> list[dict[str, Any]]:
        return await stack32_service.read_memories(
            user_id=user_id, agent_id=agent_id, query=query
        )

    async def write(
        self,
        *,
        user_id: str,
        agent_id: str,
        memory_type: str,
        content: str,
        thread_id: str | None = None,
        retention_days: int | None = None,
        max_memory_items: int | None = None,
    ) -> dict[str, Any] | None:
        return await stack32_service.write_memory(
            user_id=user_id,
            agent_id=agent_id,
            memory_type=memory_type,
            content=content,
            thread_id=thread_id,
            retention_days=retention_days,
            max_memory_items=max_memory_items,
        )

    async def cleanup(self, *, agent_id: str | None = None) -> int:
        return await stack32_service.cleanup_expired_memories(agent_id=agent_id)


def get_memory_provider(provider: str | None) -> MemoryProvider:
    """Resolve a MemoryProvider by name. External Postgres is added in a follow-up;
    unknown/absent values fall back to the safe Stack32 default."""
    # PostgresMemoryProvider (external BYO database) is wired via external_memory_configs.
    # Until an external config is validated, always use the zero-config Stack32 store.
    return Stack32MemoryProvider()
