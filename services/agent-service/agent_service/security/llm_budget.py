"""Hard caps to prevent runaway LLM spend (loops / abuse)."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field

from agent_service.config import get_settings

logger = logging.getLogger(__name__)


class LlmCallBudgetExceeded(Exception):
    """Raised when a single run exceeds its LLM call budget."""

    def __init__(self, code: str = "MODEL_BUDGET_EXCEEDED") -> None:
        self.code = code
        super().__init__(code)


@dataclass
class RunLlmBudget:
    run_id: str
    user_id: str
    agent_id: str
    max_calls: int
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    models: list[str] = field(default_factory=list)

    def register_call(
        self,
        *,
        model: str,
        input_tokens: int = 0,
        output_tokens: int = 0,
        cost_usd: float = 0.0,
    ) -> None:
        if self.calls >= self.max_calls:
            raise LlmCallBudgetExceeded()
        self.calls += 1
        self.input_tokens += max(0, input_tokens)
        self.output_tokens += max(0, output_tokens)
        self.cost_usd += max(0.0, float(cost_usd or 0))
        self.models.append(model)


_current_budget: ContextVar[RunLlmBudget | None] = ContextVar("run_llm_budget", default=None)


def get_run_llm_budget() -> RunLlmBudget | None:
    return _current_budget.get()


@asynccontextmanager
async def llm_budget_bypass():
    """Temporarily clear the run budget (e.g. final user-facing chat summary)."""
    token = _current_budget.set(None)
    try:
        yield
    finally:
        _current_budget.reset(token)


@asynccontextmanager
async def llm_run_budget(
    *,
    run_id: str,
    user_id: str,
    agent_id: str,
    max_calls: int | None = None,
):
    settings = get_settings()
    budget = RunLlmBudget(
        run_id=run_id,
        user_id=user_id,
        agent_id=agent_id,
        max_calls=max_calls or settings.MAX_LLM_CALLS_PER_RUN,
    )
    token = _current_budget.set(budget)
    try:
        yield budget
    finally:
        _current_budget.reset(token)
        logger.info(
            "llm_run_budget run=%s calls=%s in_tok=%s out_tok=%s cost_usd=%.6f models=%s",
            budget.run_id,
            budget.calls,
            budget.input_tokens,
            budget.output_tokens,
            budget.cost_usd,
            ",".join(budget.models) or "-",
        )
        if budget.calls > 0:
            try:
                from agent_service.supabase_client import get_persistence

                await get_persistence().record_usage_event(
                    user_id=budget.user_id,
                    agent_id=budget.agent_id,
                    run_id=budget.run_id,
                    event_name="llm.run",
                    quantity=budget.calls,
                    unit="calls",
                    estimated_cost=budget.cost_usd,
                    metadata={
                        "input_tokens": budget.input_tokens,
                        "output_tokens": budget.output_tokens,
                        "models": budget.models,
                    },
                )
            except Exception:  # noqa: BLE001
                logger.debug("usage_events write skipped", exc_info=True)
