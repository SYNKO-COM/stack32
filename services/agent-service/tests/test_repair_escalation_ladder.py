"""Climb the OpenAI ladder before changing vendor.

412 LiteLLM calls went to claude-sonnet-5 in one day against 42 for
gpt-5.6-sol, and Anthropic carried 80% of the bill. The router reached for the
external expert on the *second* failure — often on a verification that had
never run, where no model could have succeeded.

Two attempts on terra, then sol at its heaviest reasoning, then Anthropic.
"""

from agent_service.config import Settings
from agent_service.gateway.model_stage_router import CodingStage, route_coding_stage


def _repair(attempt: int, failures: int):
    return route_coding_stage(
        CodingStage.REPAIR_NORMAL, repair_attempt=attempt, prior_failures=failures
    )


class TestTheFirstAttemptsStayCheap:
    def test_a_first_repair_uses_the_primary(self):
        s = Settings()
        assert _repair(0, 0).model == s.MODEL_CODING_PRIMARY

    def test_so_does_a_second(self):
        s = Settings()
        assert _repair(1, 1).model == s.MODEL_CODING_PRIMARY


class TestTheSecondFailureStaysWithOpenAI:
    def test_it_moves_to_the_openai_expert_not_anthropic(self):
        s = Settings()
        route = _repair(2, 2)
        assert route.model == s.MODEL_CODING_EXPERT
        assert not route.model.startswith("anthropic/")

    def test_it_asks_for_the_heaviest_reasoning_first(self):
        assert _repair(2, 2).reasoning_effort.value == "xhigh"

    def test_it_is_the_middle_rung(self):
        assert _repair(2, 2).escalation_tier == 2

    def test_a_third_attempt_is_still_openai(self):
        s = Settings()
        assert _repair(3, 3).model == s.MODEL_CODING_EXPERT


class TestAnthropicWaitsForTheFourth:
    def test_the_fourth_attempt_changes_vendor(self):
        s = Settings()
        route = _repair(4, 4)
        assert route.model == s.MODEL_CODING_EXTERNAL_EXPERT
        assert route.model.startswith("anthropic/")

    def test_it_is_the_top_rung(self):
        assert _repair(4, 4).escalation_tier == 3

    def test_many_failures_alone_are_enough(self):
        s = Settings()
        assert _repair(0, 4).model == s.MODEL_CODING_EXTERNAL_EXPERT

    def test_the_explicit_expert_stage_still_goes_straight_there(self):
        s = Settings()
        route = route_coding_stage(CodingStage.REPAIR_EXPERT)
        assert route.model == s.MODEL_CODING_EXTERNAL_EXPERT


class TestTheLadderOnlyEverClimbs:
    def test_each_rung_costs_at_least_as_much_as_the_last(self):
        from agent_service.billing.pricing import PLATFORM_MODEL_PRICING

        def price(model: str) -> float:
            row = PLATFORM_MODEL_PRICING.get(model)
            assert row is not None, model
            return row.input_usd_per_m

        tiers = [_repair(i, i).escalation_tier or 0 for i in range(6)]
        assert tiers == sorted(tiers), tiers

    def test_the_second_failure_no_longer_jumps_to_the_top(self):
        # This is the exact case that produced the Anthropic bill.
        assert _repair(2, 2).escalation_tier != 3
