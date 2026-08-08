"""Model adapter contract for generated agents.

The runtime never imports provider SDKs. A generated agent supplies a
`ModelAdapter` implementation (e.g. wrapping the Stack32 model gateway or a
provider SDK). This keeps the runtime portable and testable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class ModelResponse:
    content: str = ""
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0


class ModelAdapter(Protocol):
    async def call(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> ModelResponse: ...
