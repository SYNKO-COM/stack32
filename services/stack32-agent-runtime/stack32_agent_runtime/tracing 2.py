"""Lightweight operational tracing for generated agents.

Emits structured operational events (never private chain-of-thought). A
generated agent injects an emitter that forwards to Stack32 observability.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

TraceEmitter = Callable[[str, dict[str, Any]], Awaitable[None]]


async def noop_emitter(_event: str, _payload: dict[str, Any]) -> None:
    return None


class Tracer:
    def __init__(self, emitter: TraceEmitter | None = None) -> None:
        self._emitter = emitter or noop_emitter
        self.events: list[tuple[str, dict[str, Any]]] = []

    async def emit(self, event: str, payload: dict[str, Any] | None = None) -> None:
        data = payload or {}
        self.events.append((event, data))
        await self._emitter(event, data)
