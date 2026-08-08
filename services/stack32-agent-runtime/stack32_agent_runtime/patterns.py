"""Agent complexity/pattern router (playbook §32).

Chooses the minimal viable architecture for a generated agent so simple agents
stay simple. Deterministic heuristics based on declared needs.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Pattern = Literal["simple_tool", "reactive", "plan_execute", "event_worker", "multi_agent"]


@dataclass
class AgentNeeds:
    tool_count: int = 0
    has_side_effects: bool = False
    needs_planning: bool = False
    is_event_driven: bool = False
    distinct_domains: int = 1
    needs_verification: bool = False


def select_pattern(needs: AgentNeeds) -> Pattern:
    if needs.distinct_domains >= 3 and needs.tool_count >= 8:
        return "multi_agent"
    if needs.is_event_driven:
        return "event_worker"
    if needs.needs_planning or needs.tool_count >= 5:
        return "plan_execute"
    if needs.tool_count == 0:
        return "simple_tool"
    return "reactive"


def recommended_limits(pattern: Pattern) -> dict[str, int]:
    return {
        "simple_tool": {"max_turns": 2, "max_tool_calls": 1},
        "reactive": {"max_turns": 12, "max_tool_calls": 8},
        "plan_execute": {"max_turns": 20, "max_tool_calls": 16},
        "event_worker": {"max_turns": 8, "max_tool_calls": 6},
        "multi_agent": {"max_turns": 30, "max_tool_calls": 24},
    }[pattern]
