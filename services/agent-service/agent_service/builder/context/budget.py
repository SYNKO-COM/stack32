"""Context budget allocator (M-B).

Approximates token budgets by characters (~4 chars/token) and allocates a
context window across the playbook's categories. Keeps allocation dynamic and
prevents any single category from starving the others.
"""

from __future__ import annotations

from dataclasses import dataclass

_CHARS_PER_TOKEN = 4

# Playbook §16.5 default policy.
_DEFAULT_WEIGHTS = {
    "system": 0.10,
    "objective": 0.10,
    "code": 0.40,
    "diff_diag": 0.15,
    "conversation": 0.10,
    "tool_output": 0.10,
    "reserve": 0.05,
}


@dataclass(slots=True)
class BudgetAllocation:
    total_tokens: int
    per_category_tokens: dict[str, int]

    def chars(self, category: str) -> int:
        return self.per_category_tokens.get(category, 0) * _CHARS_PER_TOKEN


def allocate(max_model_tokens: int, reserved_output_tokens: int, weights: dict[str, float] | None = None) -> BudgetAllocation:
    weights = weights or _DEFAULT_WEIGHTS
    usable = max(0, max_model_tokens - reserved_output_tokens)
    total_weight = sum(weights.values()) or 1.0
    per = {k: int(usable * (v / total_weight)) for k, v in weights.items()}
    return BudgetAllocation(total_tokens=usable, per_category_tokens=per)


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // _CHARS_PER_TOKEN)


def fit_to_budget(text: str, max_tokens: int) -> tuple[str, bool]:
    """Truncate `text` to fit `max_tokens`. Returns (text, truncated)."""
    cap = max_tokens * _CHARS_PER_TOKEN
    if len(text) <= cap:
        return text, False
    head = int(cap * 0.7)
    tail = cap - head - 20
    return f"{text[:head]}\n...\n{text[-tail:]}", True
