"""Optional working + semantic memory for generated agents.

Simple, dependency-free defaults. Production can inject a vector-backed
`SemanticMemory` (pgvector) implementing the same protocol.
"""

from __future__ import annotations

from typing import Protocol


class SemanticMemory(Protocol):
    async def remember(self, text: str, *, kind: str = "fact") -> None: ...

    async def recall(self, query: str, *, limit: int = 5) -> list[str]: ...


class InMemorySemanticMemory:
    def __init__(self) -> None:
        self._items: list[str] = []

    async def remember(self, text: str, *, kind: str = "fact") -> None:
        text = text.strip()
        if text:
            self._items.append(text)

    async def recall(self, query: str, *, limit: int = 5) -> list[str]:
        terms = {t for t in query.lower().split() if len(t) > 2}
        scored = sorted(
            self._items,
            key=lambda it: sum(1 for t in terms if t in it.lower()),
            reverse=True,
        )
        return [it for it in scored if any(t in it.lower() for t in terms)][:limit]
