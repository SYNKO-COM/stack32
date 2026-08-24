"""A run on the person's own LLM key is billed as a service, not as tokens.

Live agents run on the account the person connected through Pipedream: their
OpenAI invoice already charged them for those tokens. Deducting the same
dollars from their Stack32 credits charged them twice for one call, while
Stack32 spent nothing on that run. Builds are the opposite — they run on a
platform key, so they keep costing what they really cost.
"""

import pytest

from agent_service.billing.economics import (
    SERVICE_CREDITS_PER_LIVE_RUN,
    service_cost_usd_per_live_run,
)
from agent_service.security.llm_budget import RunLlmBudget, UserBudgetExhausted


def _budget(**kw) -> RunLlmBudget:
    base = dict(
        run_id="00000000-0000-0000-0000-000000000000",
        user_id="u",
        agent_id="a",
        max_calls=50,
    )
    base.update(kw)
    return RunLlmBudget(**base)


class TestTheTariff:
    def test_one_execution_costs_one_credit(self):
        assert SERVICE_CREDITS_PER_LIVE_RUN == 1.0

    def test_a_credit_is_about_five_cents_on_every_plan(self):
        for plan, credits in (("free", 25), ("starter", 100), ("pro", 200), ("scale", 400)):
            usd = service_cost_usd_per_live_run(plan, credits)
            assert 0.04 < usd < 0.07, (plan, usd)

    def test_it_stays_far_above_the_infrastructure_cost(self):
        # ~$0.0006 of Cloud Run per 22s run, measured.
        assert service_cost_usd_per_live_run() > 0.0006 * 10


class TestTheCeilingOnlyGuardsPlatformSpend:
    def test_a_user_funded_run_is_not_cut_off(self):
        b = _budget(max_cost_usd=0.10, user_funded_llm=True)
        for _ in range(5):
            b.register_call(model="openai/gpt-5.6-sol", cost_usd=1.0)
        assert b.calls == 5

    def test_a_platform_run_still_stops_at_the_ceiling(self):
        b = _budget(max_cost_usd=1.0, user_funded_llm=False)
        b.register_call(model="openai/gpt-5.3-codex", cost_usd=1.1)
        with pytest.raises(UserBudgetExhausted):
            b.register_call(model="openai/gpt-5.3-codex", cost_usd=0.1)

    def test_the_per_run_call_cap_applies_to_both(self):
        from agent_service.security.llm_budget import LlmCallBudgetExceeded

        b = _budget(max_calls=1, user_funded_llm=True)
        b.register_call(model="openai/gpt-5.6-sol")
        with pytest.raises(LlmCallBudgetExceeded):
            b.register_call(model="openai/gpt-5.6-sol")


class TestTheRollupPicksTheRightBasis:
    def test_it_bills_the_service_when_the_key_was_the_users(self):
        import inspect

        from agent_service.security import llm_budget

        src = inspect.getsource(llm_budget)
        assert "service_cost_usd_per_live_run()" in src
        assert '"pricing_basis"' in src

    def test_the_real_token_cost_is_still_recorded_for_margin(self):
        import inspect

        from agent_service.security import llm_budget

        src = inspect.getsource(llm_budget)
        assert '"cost_usd": budget.cost_usd' in src

    def test_the_gateway_flags_calls_made_on_a_caller_key(self):
        import inspect

        from agent_service.gateway import model_gateway

        src = inspect.getsource(model_gateway)
        assert "budget.user_funded_llm = True" in src
