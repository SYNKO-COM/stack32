"""One ladder, named in one place, walked by both loops.

A live build spent 19 calls on claude-sonnet-5 and none on Codex. The ladder
existed in three places that disagreed: build_pipeline named stages, the coding
agent named its own two ("patch" then "repair_hard"), and route_coding_stage
carried a numeric override that jumped to the external expert once
`repair_attempt >= 4` — firing while the recorded stage still read `repair_hard`.

The rung is now decided by `coding_stage_for_attempt` and nothing second-guesses
it. Anthropic is the last rung and is capped in both loops.
"""

from agent_service.config import Settings
from agent_service.gateway.model_stage_router import (
    CodingStage,
    coding_stage_for_attempt,
    route_coding_stage,
    uses_external_expert,
)


def _model(attempt: int) -> str:
    return route_coding_stage(CodingStage(coding_stage_for_attempt(attempt))).model


class TestTheLadderInOrder:
    EXPECTED = [
        (0, "openai/gpt-5.6-terra"),
        (1, "openai/gpt-5.6-terra"),
        (2, "openai/gpt-5.2-codex"),
        (3, "openai/gpt-5.3-codex"),
        (4, "openai/gpt-5.6-sol"),
        (5, "anthropic/claude-sonnet-5"),
    ]

    def test_each_attempt_lands_on_the_model_it_should(self):
        for attempt, model in self.EXPECTED:
            assert _model(attempt) == model, attempt

    def test_the_two_codex_rungs_come_before_sol(self):
        assert coding_stage_for_attempt(2) == "repair_codex"
        assert coding_stage_for_attempt(3) == "repair_codex_max"
        assert coding_stage_for_attempt(4) == "repair_hard"

    def test_only_the_last_rung_leaves_openai(self):
        for attempt, model in self.EXPECTED[:-1]:
            assert model.startswith("openai/"), attempt
        assert self.EXPECTED[-1][1].startswith("anthropic/")

    def test_it_never_climbs_past_the_last_rung(self):
        for attempt in (6, 12, 99):
            assert coding_stage_for_attempt(attempt) == "repair_expert"

    def test_a_negative_attempt_starts_at_the_bottom(self):
        assert coding_stage_for_attempt(-3) == "patch"


class TestTheNumericOverrideIsGone:
    def test_a_high_attempt_alone_no_longer_reaches_anthropic(self):
        # This is the exact case that produced the 19 Sonnet calls: the stage
        # said repair_hard while the router answered with the external expert.
        route = route_coding_stage(
            CodingStage.REPAIR_HARD, repair_attempt=9, prior_failures=9
        )
        assert route.model == Settings().MODEL_CODING_EXPERT
        assert not route.model.startswith("anthropic/")

    def test_the_named_stage_is_what_decides(self):
        s = Settings()
        assert (
            route_coding_stage(CodingStage.REPAIR_CODEX).model
            == s.MODEL_CODING_CODEX_FIRST
        )
        assert (
            route_coding_stage(CodingStage.REPAIR_EXPERT).model
            == s.MODEL_CODING_EXTERNAL_EXPERT
        )


class TestTheFirstBuild:
    def test_it_uses_a_coding_model_not_the_dearest(self):
        s = Settings()
        route = route_coding_stage(CodingStage.ARCHITECTURE)
        assert route.model == s.MODEL_CODING_INITIAL
        assert route.model != s.MODEL_CODING_EXPERT

    def test_the_initial_model_costs_less_than_the_expert(self):
        from agent_service.billing.pricing import PLATFORM_MODEL_PRICING as P

        s = Settings()
        assert (
            P[s.MODEL_CODING_INITIAL].input_usd_per_m
            < P[s.MODEL_CODING_EXPERT].input_usd_per_m
        )


class TestAnthropicIsCappedInBothLoops:
    def test_the_cap_is_two(self):
        assert Settings().MAX_EXTERNAL_EXPERT_CALLS == 2

    def test_the_helper_names_the_rung_that_changes_vendor(self):
        assert uses_external_expert("repair_expert")
        assert not uses_external_expert("repair_hard")
        assert not uses_external_expert("repair_codex_max")

    def test_the_outer_pipeline_counts_and_stops(self):
        import inspect

        from agent_service.builder import build_pipeline

        src = inspect.getsource(build_pipeline)
        assert "external_expert_calls" in src
        assert "MAX_EXTERNAL_EXPERT_CALLS" in src

    def test_the_inner_coding_loop_counts_and_stops_too(self):
        import inspect

        from agent_service.builder.coding import agent

        src = inspect.getsource(agent)
        # This is the loop that ran 19 times against the other vendor.
        assert "external_expert_calls" in src
        assert "MAX_EXTERNAL_EXPERT_CALLS" in src
        assert "REPAIR_BUDGET_EXHAUSTED" in src

    def test_both_loops_read_the_same_ladder(self):
        import inspect

        from agent_service.builder import build_pipeline
        from agent_service.builder.coding import agent

        for module in (build_pipeline, agent):
            assert "coding_stage_for_attempt" in inspect.getsource(module)


class TestEveryRungIsPriced:
    def test_the_registry_knows_them_all(self):
        from agent_service.billing.pricing import PLATFORM_MODEL_PRICING as P

        # The registry is fail-closed; an unpriced model would be blocked.
        for attempt in range(6):
            assert _model(attempt) in P, attempt
