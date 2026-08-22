"""Context tier allocation for stable prompt caching prefixes."""

from __future__ import annotations

from dataclasses import dataclass

from agent_service.builder.context.budget import BudgetAllocation, allocate


@dataclass(frozen=True)
class ContextTiers:
    """Tier 0 = stable system prefix; tier 1 = project index; tier 2 = retrieved chunks."""

    stable_prefix_tokens: int = 1200
    project_index_tokens: int = 2500
    retrieval_tokens: int = 4000


def tiered_allocation(*, complexity: str = "moderate") -> BudgetAllocation:
    """Map complexity to tier budgets."""
    base = allocate(128_000, 8_000)
    if complexity == "heavy":
        return BudgetAllocation(
            total_tokens=base.total_tokens,
            per_category_tokens={
                "stable": 1600,
                "index": 3500,
                "code": 6000,
                "diagnostics": base.per_category_tokens.get("diagnostics", 800),
            },
        )
    if complexity == "fast":
        return BudgetAllocation(
            total_tokens=base.total_tokens,
            per_category_tokens={
                "stable": 800,
                "index": 1500,
                "code": 2500,
                "diagnostics": base.per_category_tokens.get("diagnostics", 400),
            },
        )
    return BudgetAllocation(
        total_tokens=base.total_tokens,
        per_category_tokens={
            "stable": 1200,
            "index": 2500,
            "code": 4000,
            "diagnostics": base.per_category_tokens.get("diagnostics", 600),
        },
    )


STABLE_SYSTEM_PREFIX = (
    "You are the Stack32 Builder coding agent. Operate only via sandbox tools. "
    "Never mutate protected agent scope during REPAIR unless explicitly authorized. "
    "Run tests and lint before completion."
)
