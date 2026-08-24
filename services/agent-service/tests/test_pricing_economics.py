"""Tests for pricing registry and plan economics."""

from __future__ import annotations

from agent_service.billing.economics import effective_ai_budget_usd, usd_per_credit
from agent_service.billing.pricing import estimate_cost_usd_from_tokens, lookup_model_pricing


def test_luna_pricing():
    cost, source = estimate_cost_usd_from_tokens("openai/gpt-5.6-luna", 1_000_000, 1_000_000)
    assert source == "registry"
    assert 1.0 < cost < 1.5


def test_sonnet_reservation_rates():
    pricing = lookup_model_pricing("anthropic/claude-sonnet-5")
    assert pricing is not None
    assert pricing.budget_reservation_input_usd_per_m == 3.0
    assert pricing.budget_reservation_output_usd_per_m == 15.0


def test_unknown_model_conservative():
    cost, source = estimate_cost_usd_from_tokens("vendor/unknown-ultra", 1_000_000, 1_000_000, platform_paid=True)
    assert source == "conservative_fallback"
    assert cost >= 10.0


def test_starter_annual_budget_cap():
    budget = effective_ai_budget_usd("starter", billing_interval="annual", credits_monthly=100)
    assert budget <= 5.0


def test_starter_monthly_budget():
    budget = effective_ai_budget_usd("starter", billing_interval="monthly", credits_monthly=100)
    assert abs(budget - 6.0) < 0.01


def test_free_budget_covers_one_first_build():
    # $0.20 stopped every free user a fifth of the way into their first build
    # (~$1 measured). The free budget now covers one full build with room for
    # a couple of live turns.
    budget = effective_ai_budget_usd("free", billing_interval="monthly", credits_monthly=25)
    assert abs(budget - 1.30) < 0.01
    assert budget >= 1.0  # the measured first-build cost


def test_usd_per_credit_starter():
    rate = usd_per_credit("starter", 100, "monthly")
    assert abs(rate - 0.06) < 0.001
