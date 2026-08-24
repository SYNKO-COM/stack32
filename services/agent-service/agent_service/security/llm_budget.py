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
    #: Which half of the product spent this — "builder" or "live".
    source: str = "builder"
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
        profile: str = "coding",
        stage: str | None = None,
        reasoning_effort: str | None = None,
        latency_ms: int = 0,
        idempotency_key: str | None = None,
        success: bool = True,
        error_code: str | None = None,
    ) -> None:
        if self.calls >= self.max_calls:
            raise LlmCallBudgetExceeded()
        self.calls += 1
        self.input_tokens += max(0, input_tokens)
        self.output_tokens += max(0, output_tokens)
        self.cost_usd += max(0.0, float(cost_usd or 0))
        self.models.append(model)
        self._record_per_call_event(
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost_usd,
            profile=profile,
            stage=stage,
            reasoning_effort=reasoning_effort,
            latency_ms=latency_ms,
            idempotency_key=idempotency_key,
            success=success,
            error_code=error_code,
        )

    def _record_per_call_event(
        self,
        *,
        model: str,
        input_tokens: int,
        output_tokens: int,
        cost_usd: float,
        profile: str,
        stage: str | None,
        reasoning_effort: str | None,
        latency_ms: int,
        idempotency_key: str | None,
        success: bool,
        error_code: str | None,
    ) -> None:
        import asyncio
        import uuid

        key = idempotency_key or f"{self.run_id}:{self.calls}:{uuid.uuid4().hex[:12]}"
        provider = model.split("/", 1)[0] if "/" in model else "unknown"

        async def _write() -> None:
            try:
                from agent_service.supabase_client import get_persistence

                await get_persistence().record_llm_usage_event(
                    user_id=self.user_id,
                    agent_id=self.agent_id,
                    run_id=self.run_id,
                    profile=profile,
                    stage=stage,
                    provider=provider,
                    model=model,
                    reasoning_effort=reasoning_effort,
                    source=self.source,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    estimated_cost_usd=float(cost_usd or 0),
                    final_cost_usd=float(cost_usd or 0),
                    idempotency_key=key,
                    latency_ms=latency_ms,
                    success=success,
                    error_code=error_code,
                )
            except Exception:  # noqa: BLE001
                logger.debug("llm_usage_event write skipped", exc_info=True)

        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_write())
        except RuntimeError:
            pass


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
    source: str = "builder",
):
    settings = get_settings()
    budget = RunLlmBudget(
        run_id=run_id,
        user_id=user_id,
        agent_id=agent_id,
        max_calls=max_calls or settings.MAX_LLM_CALLS_PER_RUN,
        source=source,
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
                        "cost_usd": budget.cost_usd,
                    },
                )
            except Exception:  # noqa: BLE001
                logger.debug("usage_events write skipped", exc_info=True)
