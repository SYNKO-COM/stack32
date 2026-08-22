"""Platform model pricing registry — fail-closed for unknown models."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

PricingSource = Literal["registry", "litellm", "conservative_fallback", "blocked"]


@dataclass(frozen=True)
class ModelPricing:
    provider: str
    model: str
    input_usd_per_m: float
    cached_input_usd_per_m: float
    output_usd_per_m: float
    budget_reservation_input_usd_per_m: float | None = None
    budget_reservation_output_usd_per_m: float | None = None


# Reservation rates use published standard pricing (Sonnet $3/$15 not promo).
PLATFORM_MODEL_PRICING: dict[str, ModelPricing] = {
    "openai/gpt-5.6-luna": ModelPricing("openai", "gpt-5.6-luna", 0.20, 0.02, 1.20),
    "openai/gpt-5.6-terra": ModelPricing("openai", "gpt-5.6-terra", 2.00, 0.20, 12.00),
    "openai/gpt-5.6-sol": ModelPricing("openai", "gpt-5.6-sol", 5.00, 0.50, 30.00),
    "anthropic/claude-sonnet-5": ModelPricing(
        "anthropic",
        "claude-sonnet-5",
        2.00,
        0.0,
        10.00,
        budget_reservation_input_usd_per_m=3.00,
        budget_reservation_output_usd_per_m=15.00,
    ),
    "openai/text-embedding-3-small": ModelPricing("openai", "text-embedding-3-small", 0.02, 0.0, 0.0),
    # Legacy / BYOK compatibility
    "gpt-4o-mini": ModelPricing("openai", "gpt-4o-mini", 0.15, 0.0, 0.6),
    "gpt-4o": ModelPricing("openai", "gpt-4o", 2.5, 0.0, 10.0),
    "grok-4": ModelPricing("xai", "grok-4", 3.0, 0.0, 15.0),
    "grok-4.5": ModelPricing("xai", "grok-4.5", 3.0, 0.0, 15.0),
}

# Conservative fallback when model unknown — fail closed financially.
CONSERVATIVE_FALLBACK_RATES = (10.0, 30.0)


def lookup_model_pricing(model: str) -> ModelPricing | None:
    raw = (model or "").strip()
    if not raw:
        return None
    if raw in PLATFORM_MODEL_PRICING:
        return PLATFORM_MODEL_PRICING[raw]
    lower = raw.lower()
    for key, pricing in PLATFORM_MODEL_PRICING.items():
        if key.lower() in lower or lower.endswith(key.split("/")[-1]):
            return pricing
    return None


def estimate_cost_usd_from_tokens(
    model: str,
    input_tokens: int,
    output_tokens: int,
    *,
    cached_input_tokens: int = 0,
    platform_paid: bool = True,
) -> tuple[float, PricingSource]:
    """Return (cost_usd, source). Unknown platform models use conservative fallback."""
    pricing = lookup_model_pricing(model)
    if pricing is None:
        if platform_paid:
            inp, out = CONSERVATIVE_FALLBACK_RATES
            cost = (input_tokens * inp + output_tokens * out) / 1_000_000.0
            return cost, "conservative_fallback"
        inp, out = (1.0, 3.0)
        cost = (input_tokens * inp + output_tokens * out) / 1_000_000.0
        return cost, "conservative_fallback"

    uncached = max(0, input_tokens - cached_input_tokens)
    cost = (
        uncached * pricing.input_usd_per_m
        + cached_input_tokens * pricing.cached_input_usd_per_m
        + output_tokens * pricing.output_usd_per_m
    ) / 1_000_000.0
    return cost, "registry"


def reservation_rates(model: str) -> tuple[float, float]:
    """Input/output USD per M for budget reservation (may exceed actual promo rates)."""
    pricing = lookup_model_pricing(model)
    if pricing is None:
        return CONSERVATIVE_FALLBACK_RATES
    inp = pricing.budget_reservation_input_usd_per_m or pricing.input_usd_per_m
    out = pricing.budget_reservation_output_usd_per_m or pricing.output_usd_per_m
    return inp, out


def estimate_max_call_cost_usd(
    model: str,
    *,
    input_tokens: int,
    max_output_tokens: int,
) -> float:
    inp_rate, out_rate = reservation_rates(model)
    return (input_tokens * inp_rate + max_output_tokens * out_rate) / 1_000_000.0
