"""Hard caps to prevent runaway LLM spend (loops / abuse)."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field

from agent_service.config import get_settings

logger = logging.getLogger(__name__)


class UserBudgetExhausted(Exception):
    """The person's remaining credits ran out while a run was under way.

    Blocking the next message is not enough: a build already in flight kept
    spending past the plan's ceiling, which is how an $11 run sat behind a bar
    reading 42 of 200. This stops the run itself.
    """

    def __init__(self, code: str = "BUDGET_EXCEEDED") -> None:
        self.code = code
        super().__init__(code)


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
    #: What the person has left to spend this period, in USD. None means the
    #: ceiling could not be read and the run is not gated on it.
    max_cost_usd: float | None = None
    #: True when the tokens were billed to the person's own LLM account
    #: (Pipedream Connect), not to a Stack32 platform key. Their OpenAI
    #: invoice already charged them; deducting the same dollars from their
    #: Stack32 credits would charge them twice for one call.
    user_funded_llm: bool = False
    #: The caller's plan and credit tier, read once when the run opens, so the
    #: roll-up can price the service in that plan's own credits — and waive it
    #: entirely on free, which is already capped at ten live messages.
    plan_key: str = "free"
    credits_monthly: int = 0
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
        # Checked before the increment so the call that would cross the plan's
        # ceiling is the one that stops the run, not the one after it.
        #
        # The ceiling guards the person's Stack32 budget, which only funds
        # platform-key tokens. A run on their own LLM account spends their
        # provider balance, so cutting it off against our ceiling would stop
        # work they are already paying for elsewhere; that run is billed one
        # flat service credit at roll-up instead.
        if (
            not self.user_funded_llm
            and self.max_cost_usd is not None
            and self.cost_usd >= self.max_cost_usd
        ):
            raise UserBudgetExhausted()
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
                # Not debug. A usage event that fails to write is money already
                # spent and never billed: the coding pipeline lost every one of
                # its calls this way for a whole day, and the credit gauge read
                # a fifth of the real consumption while nothing complained.
                logger.warning(
                    "llm_usage_event_write_failed run=%s model=%s source=%s",
                    self.run_id,
                    model,
                    self.source,
                    exc_info=True,
                )

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


async def resolve_budget_context(user_id: str) -> tuple[float | None, str, int]:
    """(remaining_usd, plan_key, credits_monthly) — one lookup per run."""
    remaining = await remaining_budget_usd(user_id)
    plan_key, credits = "free", 0
    try:
        from agent_service.supabase_client import get_supabase_admin_client

        async with get_supabase_admin_client() as client:
            response = await client.post(
                "/rpc/resolve_user_entitlements", json={"p_user_id": user_id}
            )
            if response.status_code < 400:
                rows = response.json() or []
                row = rows[0] if isinstance(rows, list) and rows else rows
                if isinstance(row, dict):
                    plan_key = str(row.get("plan_key") or "free")
                    credits = int(row.get("credits_monthly") or 0)
    except Exception:  # noqa: BLE001
        logger.warning("plan_context_lookup_failed user=%s", user_id, exc_info=True)
    return remaining, plan_key, credits


async def remaining_budget_usd(user_id: str) -> float | None:
    """What this person may still spend this period, or None if unknown.

    Read once when a run opens rather than per call: one round trip, and the
    run cannot outspend the ceiling by more than the call in flight.
    """
    try:
        from agent_service.supabase_client import get_supabase_admin_client

        async with get_supabase_admin_client() as client:
            response = await client.post(
                "/rpc/resolve_user_entitlements",
                json={"p_user_id": user_id},
            )
            if response.status_code >= 400:
                return None
            rows = response.json() or []
            row = rows[0] if isinstance(rows, list) and rows else rows
            if not isinstance(row, dict):
                return None
            budget = float(row.get("budget_usd") or 0)

            spent = await client.post(
                "/rpc/user_period_usage_usd", json={"p_user_id": user_id}
            )
            used = float(spent.json() or 0) if spent.status_code < 400 else 0.0
        return max(0.0, budget - used)
    except Exception:  # noqa: BLE001
        logger.warning("remaining_budget_lookup_failed user=%s", user_id, exc_info=True)
        return None


async def _reserve_run_budget(run_id: str, user_id: str, requested: float | None) -> float | None:
    """Atomically claim this run's slice of the remaining budget.

    Returns the granted amount, or None when the RPC itself failed — the
    caller then falls back to the plain read (the pre-reservation behaviour),
    loudly, rather than blocking every run on an infrastructure hiccup.
    """
    try:
        from agent_service.supabase_client import get_supabase_admin_client

        async with get_supabase_admin_client() as client:
            response = await client.post(
                "/rpc/reserve_run_budget",
                json={
                    "p_run_id": run_id,
                    "p_user_id": user_id,
                    "p_requested": requested,
                },
            )
            if response.status_code < 400:
                return float(response.json() or 0.0)
    except Exception:  # noqa: BLE001
        pass
    logger.error("budget_reservation_failed run=%s — falling back to read", run_id)
    return None


async def _settle_run_budget(run_id: str) -> None:
    """Release this run's reservation; real spend already sits in usage_events."""
    try:
        from agent_service.supabase_client import get_supabase_admin_client

        async with get_supabase_admin_client() as client:
            await client.post("/rpc/settle_run_budget", json={"p_run_id": run_id})
    except Exception:  # noqa: BLE001
        # A held row older than 2h stops counting on its own.
        logger.warning("budget_settle_failed run=%s", run_id, exc_info=True)


@asynccontextmanager
async def llm_run_budget(
    *,
    run_id: str,
    user_id: str,
    agent_id: str,
    max_calls: int | None = None,
    source: str = "builder",
    enforce_user_budget: bool = True,
    user_funded_llm: bool = False,
):
    settings = get_settings()
    ceiling: float | None = None
    plan_key, credits_monthly = "free", 0
    reserved = False
    if enforce_user_budget:
        ceiling, plan_key, credits_monthly = await resolve_budget_context(user_id)
        # The run's ceiling is what it RESERVED, not what it read: concurrent
        # runs each take an exclusive slice and their sum stays within the
        # budget, instead of every run believing the same remainder is its own.
        if ceiling is not None:
            requested = min(ceiling, settings.MAX_RESERVED_USD_PER_RUN)
            granted = await _reserve_run_budget(run_id, user_id, requested)
            if granted is not None:
                ceiling = granted
                reserved = True
    budget = RunLlmBudget(
        run_id=run_id,
        user_id=user_id,
        agent_id=agent_id,
        max_calls=max_calls or settings.MAX_LLM_CALLS_PER_RUN,
        source=source,
        max_cost_usd=ceiling,
        user_funded_llm=user_funded_llm,
        plan_key=plan_key,
        credits_monthly=credits_monthly,
    )
    token = _current_budget.set(budget)
    try:
        yield budget
    finally:
        _current_budget.reset(token)
        if reserved:
            await _settle_run_budget(run_id)
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

                # A run on the person's own key costs Stack32 no tokens, so
                # the gauge bills the service instead of the LLM: one flat
                # credit per execution. Platform-funded runs (every build)
                # still deduct what they really cost.
                billed_usd = budget.cost_usd
                pricing_basis = "llm_cost"
                if budget.user_funded_llm:
                    if budget.plan_key == "free":
                        # Free is already boxed in — ten live messages, five
                        # credits' worth of budget. Charging a service credit
                        # on top would spend a fifth of their month on one
                        # test message; the box is the price, the run is not.
                        billed_usd = 0.0
                        pricing_basis = "free_plan_included"
                    else:
                        from agent_service.billing.economics import (
                            service_cost_usd_per_live_run,
                        )

                        billed_usd = service_cost_usd_per_live_run(
                            budget.plan_key,  # type: ignore[arg-type]
                            budget.credits_monthly or 1,
                        )
                        pricing_basis = "service_flat"

                await get_persistence().record_usage_event(
                    user_id=budget.user_id,
                    agent_id=budget.agent_id,
                    run_id=budget.run_id,
                    event_name="llm.run",
                    quantity=budget.calls,
                    unit="calls",
                    estimated_cost=billed_usd,
                    metadata={
                        "input_tokens": budget.input_tokens,
                        "output_tokens": budget.output_tokens,
                        "models": budget.models,
                        # What the tokens really cost, kept for margin analysis
                        # even when it is the person's own provider bill.
                        "cost_usd": budget.cost_usd,
                        "billed_usd": billed_usd,
                        "pricing_basis": pricing_basis,
                        "user_funded_llm": budget.user_funded_llm,
                    },
                )
            except Exception:  # noqa: BLE001
                # This roll-up is what the credit gauge sums. Losing it means
                # the bar under-reads real consumption, which is how a run that
                # cost $11 showed 42 credits of 200.
                logger.warning(
                    "usage_event_write_failed run=%s calls=%s cost=%.4f",
                    budget.run_id,
                    budget.calls,
                    budget.cost_usd,
                    exc_info=True,
                )
