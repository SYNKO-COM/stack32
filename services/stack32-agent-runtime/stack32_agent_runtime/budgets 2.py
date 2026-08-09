"""Runtime limits / budgets for generated agents."""

from __future__ import annotations

from dataclasses import dataclass


class BudgetExceeded(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass
class RuntimeLimits:
    max_turns: int = 12
    max_tool_calls: int = 8
    max_cost_usd: float = 1.0

    def enforce(self, *, turns: int, tool_calls: int, cost_usd: float) -> None:
        if turns >= self.max_turns:
            raise BudgetExceeded("TURN_LIMIT_REACHED")
        if tool_calls >= self.max_tool_calls:
            raise BudgetExceeded("TOOL_CALL_LIMIT_REACHED")
        if cost_usd >= self.max_cost_usd:
            raise BudgetExceeded("COST_LIMIT_REACHED")
