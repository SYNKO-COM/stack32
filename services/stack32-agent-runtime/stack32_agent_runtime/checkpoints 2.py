"""Checkpoint contract + in-memory implementation for generated agents.

Production deployments swap the in-memory checkpointer for a durable
(PostgreSQL) one. The contract keeps the runtime resumable.
"""

from __future__ import annotations

from typing import Protocol

from stack32_agent_runtime.state import AgentState


class Checkpointer(Protocol):
    async def load(self, thread_id: str) -> AgentState | None: ...

    async def save(self, thread_id: str, state: AgentState) -> None: ...


class InMemoryCheckpointer:
    def __init__(self) -> None:
        self._store: dict[str, str] = {}

    async def load(self, thread_id: str) -> AgentState | None:
        raw = self._store.get(thread_id)
        return AgentState.model_validate_json(raw) if raw else None

    async def save(self, thread_id: str, state: AgentState) -> None:
        self._store[thread_id] = state.model_dump_json()
