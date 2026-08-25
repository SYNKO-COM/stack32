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


def test_free_budget_matches_its_ten_credit_grant():
    # The free grant is 10 credits priced at the Pro rate, so the budget is
    # exactly what those credits are worth — no more, no less.
    budget = effective_ai_budget_usd("free", billing_interval="monthly", credits_monthly=10)
    assert abs(budget - 0.55) < 0.01


def test_usd_per_credit_starter():
    rate = usd_per_credit("starter", 100, "monthly")
    assert abs(rate - 0.06) < 0.001


def test_a_free_credit_costs_exactly_what_a_pro_credit_costs():
    """A balance carried over from a lapsed subscription must not drift.

    Dollars are the store of record: at $0.052 a free credit against Pro's
    $0.055, ten Pro credits spent came back as 10.6 free ones on the gauge.
    Matching the rate makes the conversion one-for-one.
    """
    assert abs(usd_per_credit("free", 10) - usd_per_credit("pro", 200)) < 1e-9
