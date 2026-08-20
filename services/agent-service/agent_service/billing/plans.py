"""Plan catalog + credit/budget math (mirrors apps/web/lib/billing/plans.ts)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

PlanKey = Literal["free", "starter", "pro", "scale"]
BillingInterval = Literal["monthly", "annual"]

CREDIT_TIER_OPTIONS = (100, 200, 400, 800, 1200, 2000, 3000, 4000, 5000, 7500, 10_000)


@dataclass(frozen=True)
class PlanDefinition:
    key: PlanKey
    monthly_price_usd: float
    annual_monthly_price_usd: float
    base_credits: int
    base_budget_usd: float
    max_workspaces: int | None
    max_agents: int | None
    max_live_messages: int | None
    can_publish: bool
    can_monetize: bool
    beta_access: bool


PLANS: dict[PlanKey, PlanDefinition] = {
    "free": PlanDefinition(
        key="free",
        monthly_price_usd=0,
        annual_monthly_price_usd=0,
        base_credits=5,
        base_budget_usd=0.2,
        max_workspaces=1,
        max_agents=1,
        max_live_messages=3,
        can_publish=False,
        can_monetize=False,
        beta_access=False,
    ),
    "starter": PlanDefinition(
        key="starter",
        monthly_price_usd=24,
        annual_monthly_price_usd=20,
        base_credits=100,
        base_budget_usd=6.0,
        max_workspaces=1,
        max_agents=5,
        max_live_messages=None,
        can_publish=True,
        can_monetize=False,
        beta_access=False,
    ),
    "pro": PlanDefinition(
        key="pro",
        monthly_price_usd=49,
        annual_monthly_price_usd=40,
        base_credits=200,
        base_budget_usd=11.0,
        max_workspaces=None,
        max_agents=30,
        max_live_messages=None,
        can_publish=True,
        can_monetize=True,
        beta_access=True,
    ),
    "scale": PlanDefinition(
        key="scale",
        monthly_price_usd=99,
        annual_monthly_price_usd=80,
        base_credits=400,
        base_budget_usd=21.0,
        max_workspaces=None,
        max_agents=None,
        max_live_messages=None,
        can_publish=True,
        can_monetize=True,
        beta_access=True,
    ),
}


MODEL_TOKEN_RATES_USD_PER_M: dict[str, tuple[float, float]] = {
    "gpt-4o-mini": (0.15, 0.6),
    "gpt-4o": (2.5, 10.0),
    "text-embedding-3-small": (0.02, 0.0),
    "grok-4": (3.0, 15.0),
    "grok-4.5": (3.0, 15.0),
    "grok-3": (3.0, 15.0),
    "grok-3-mini": (0.3, 0.5),
}


def estimate_cost_usd_from_tokens(model: str, input_tokens: int, output_tokens: int) -> float:
    lower = (model or "").lower()
    rates = (1.0, 3.0)
    for key, value in MODEL_TOKEN_RATES_USD_PER_M.items():
        if key in lower:
            rates = value
            break
    return (input_tokens * rates[0] + output_tokens * rates[1]) / 1_000_000.0


def budget_usd_for_credits(plan_key: PlanKey, credits_monthly: int) -> float:
    plan = PLANS[plan_key]
    if plan.base_credits <= 0:
        return plan.base_budget_usd
    return plan.base_budget_usd * credits_monthly / plan.base_credits
