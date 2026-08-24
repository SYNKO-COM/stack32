"""A run already in flight must not outspend the plan.

Blocking the next message was the only gate: a build under way kept calling
models past the ceiling, which is how an $11 run sat behind a bar reading 42
credits of 200. The run itself now stops.
"""

import pytest

from agent_service.security.llm_budget import (
    LlmCallBudgetExceeded,
    RunLlmBudget,
    UserBudgetExhausted,
    llm_run_budget,
)


def _budget(*, ceiling: float | None, max_calls: int = 50) -> RunLlmBudget:
    return RunLlmBudget(
        run_id="00000000-0000-0000-0000-000000000000",
        user_id="u",
        agent_id="a",
        max_calls=max_calls,
        max_cost_usd=ceiling,
    )


class TestTheCeilingStopsTheRun:
    def test_a_run_under_the_ceiling_keeps_going(self):
        b = _budget(ceiling=1.0)
        b.register_call(model="openai/gpt-5.6-terra", cost_usd=0.4)
        b.register_call(model="openai/gpt-5.6-terra", cost_usd=0.4)
        assert b.calls == 2

    def test_the_call_that_would_cross_it_is_refused(self):
        b = _budget(ceiling=1.0)
        b.register_call(model="openai/gpt-5.6-terra", cost_usd=0.6)
        b.register_call(model="openai/gpt-5.6-terra", cost_usd=0.5)  # now at 1.10
        with pytest.raises(UserBudgetExhausted):
            b.register_call(model="openai/gpt-5.6-terra", cost_usd=0.1)

    def test_it_carries_the_code_the_ui_opens_the_upgrade_dialog_on(self):
        b = _budget(ceiling=0.0)
        with pytest.raises(UserBudgetExhausted) as exc:
            b.register_call(model="openai/gpt-5.6-terra", cost_usd=0.1)
        assert exc.value.code == "BUDGET_EXCEEDED"

    def test_a_person_with_nothing_left_cannot_start_a_call(self):
        b = _budget(ceiling=0.0)
        with pytest.raises(UserBudgetExhausted):
            b.register_call(model="openai/gpt-5.6-terra", cost_usd=0.0)


class TestAnUnknownCeilingDoesNotBlockAnyone:
    def test_none_means_no_gate(self):
        b = _budget(ceiling=None)
        for _ in range(5):
            b.register_call(model="openai/gpt-5.6-terra", cost_usd=100.0)
        assert b.calls == 5

    def test_the_per_run_call_cap_still_applies(self):
        b = _budget(ceiling=None, max_calls=2)
        b.register_call(model="openai/gpt-5.6-terra")
        b.register_call(model="openai/gpt-5.6-terra")
        with pytest.raises(LlmCallBudgetExceeded):
            b.register_call(model="openai/gpt-5.6-terra")


class TestTheTwoLimitsAreDistinct:
    def test_the_call_cap_is_ours_the_ceiling_is_theirs(self):
        # MODEL_BUDGET_EXCEEDED is our own per-run guard and is soft-skipped as
        # a platform failure. BUDGET_EXCEEDED is the person's plan and must
        # reach them, so the codes must never be confused.
        assert LlmCallBudgetExceeded().code == "MODEL_BUDGET_EXCEEDED"
        assert UserBudgetExhausted().code == "BUDGET_EXCEEDED"


class TestTheCeilingIsReadWhenTheRunOpens:
    @pytest.mark.asyncio
    async def test_it_can_be_turned_off_for_paths_that_must_not_be_gated(self):
        async with llm_run_budget(
            run_id="00000000-0000-0000-0000-000000000000",
            user_id="u",
            agent_id="a",
            max_calls=3,
            enforce_user_budget=False,
        ) as budget:
            assert budget.max_cost_usd is None
