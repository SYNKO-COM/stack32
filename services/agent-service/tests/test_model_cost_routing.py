"""A fallback is the degraded path, not the escalation.

Eleven hours of preprod traffic cost $2.32, and gpt-5.6-sol accounted for
$2.25 of it on 98.6% of the tokens. sol is the most expensive model in the
registry — $5/M in, $30/M out, against terra's $2/$12 and luna's $0.20/$1.20 —
and both the coding and reasoning tiers named it as their *fallback*, so a
failure of a $2/M model retried on a $5/M one. The balanced and validator tiers
have always fallen back to something cheaper.
"""

from agent_service.billing.pricing import PLATFORM_MODEL_PRICING
from agent_service.config import Settings


def _input_price(model: str) -> float:
    row = PLATFORM_MODEL_PRICING.get(model)
    assert row is not None, f"{model} has no price in the registry"
    return row.input_usd_per_m


class TestFallbacksCostNoMoreThanWhatTheyReplace:
    def test_coding_falls_back_no_higher_than_its_primary(self):
        s = Settings()
        assert _input_price(s.MODEL_CODING_FALLBACK) <= _input_price(s.MODEL_CODING_PRIMARY)

    def test_reasoning_falls_back_no_higher_than_its_primary(self):
        s = Settings()
        assert _input_price(s.MODEL_REASONING_FALLBACK) <= _input_price(
            s.MODEL_REASONING_PRIMARY
        )

    def test_balanced_and_validator_were_already_right(self):
        s = Settings()
        for primary, fallback in (
            (s.MODEL_BALANCED_PRIMARY, s.MODEL_BALANCED_FALLBACK),
            (s.MODEL_VALIDATOR_PRIMARY, s.MODEL_VALIDATOR_FALLBACK),
        ):
            assert _input_price(fallback) <= _input_price(primary)

    def test_no_tier_falls_back_onto_its_own_expert(self):
        s = Settings()
        assert s.MODEL_CODING_FALLBACK != s.MODEL_CODING_EXPERT
        assert s.MODEL_REASONING_FALLBACK != s.MODEL_REASONING_EXPERT


class TestTheExpensiveModelStaysTheEscalation:
    def test_sol_is_still_the_expert(self):
        s = Settings()
        assert s.MODEL_CODING_EXPERT == "openai/gpt-5.6-sol"
        assert s.MODEL_REASONING_EXPERT == "openai/gpt-5.6-sol"

    def test_sol_really_is_the_dearest_of_the_three(self):
        assert _input_price("openai/gpt-5.6-sol") > _input_price("openai/gpt-5.6-terra")
        assert _input_price("openai/gpt-5.6-terra") > _input_price("openai/gpt-5.6-luna")


class TestAnthropicRemainsTheLastResort:
    def test_it_is_reached_only_as_the_external_expert(self):
        s = Settings()
        assert s.MODEL_CODING_EXTERNAL_EXPERT.startswith("anthropic/")
        for tier in (
            s.MODEL_BALANCED_PRIMARY,
            s.MODEL_BALANCED_FALLBACK,
            s.MODEL_REASONING_PRIMARY,
            s.MODEL_REASONING_FALLBACK,
            s.MODEL_CODING_PRIMARY,
            s.MODEL_CODING_FALLBACK,
            s.MODEL_VALIDATOR_PRIMARY,
            s.MODEL_VALIDATOR_FALLBACK,
        ):
            assert not tier.startswith("anthropic/")

    def test_and_it_is_cheaper_than_the_openai_expert_anyway(self):
        # Worth knowing before treating Anthropic as the expensive option.
        assert _input_price("anthropic/claude-sonnet-5") < _input_price(
            "openai/gpt-5.6-sol"
        )
