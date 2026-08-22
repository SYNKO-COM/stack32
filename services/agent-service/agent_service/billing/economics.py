"""Interval-aware plan economics (mirrors SQL effective_ai_budget_usd)."""

from __future__ import annotations

from agent_service.billing.plans import PLANS, PlanKey, BillingInterval

MAX_VARIABLE_AI_COST_RATIO = 0.25

# Annual effective monthly AI budget caps (>=75% margin on $20/$40/$80 tiers).
ANNUAL_MONTHLY_AI_BUDGET: dict[PlanKey, float] = {
    "starter": 5.0,
    "pro": 10.0,
    "scale": 20.0,
}


def effective_monthly_revenue_usd(plan_key: PlanKey, billing_interval: BillingInterval) -> float:
    plan = PLANS[plan_key]
    if plan_key == "free":
        return 0.0
    if billing_interval == "annual":
        return plan.annual_monthly_price_usd
    return plan.monthly_price_usd


def effective_ai_budget_usd(
    plan_key: PlanKey,
    *,
    billing_interval: BillingInterval = "monthly",
    credits_monthly: int,
) -> float:
    plan = PLANS[plan_key]
    if plan_key == "free":
        return plan.base_budget_usd * max(credits_monthly, plan.base_credits) / max(plan.base_credits, 1)

    if billing_interval == "annual":
        base = ANNUAL_MONTHLY_AI_BUDGET.get(plan_key, plan.base_budget_usd)
    else:
        base = plan.base_budget_usd

    scale = max(credits_monthly, 1) / max(plan.base_credits, 1)
    scaled = base * scale
    # Cap against scaled plan revenue so extra credit tiers keep proportional budget.
    revenue = effective_monthly_revenue_usd(plan_key, billing_interval) * scale
    if revenue > 0:
        return min(scaled, revenue * MAX_VARIABLE_AI_COST_RATIO)
    return scaled


def usd_per_credit(plan_key: PlanKey, credits_monthly: int, billing_interval: BillingInterval = "monthly") -> float:
    budget = effective_ai_budget_usd(
        plan_key,
        billing_interval=billing_interval,
        credits_monthly=credits_monthly,
    )
    credits = max(credits_monthly, 1)
    return budget / credits
