"""Usage must be filed under the half of the product that spent it.

Eleven hours of preprod traffic recorded 63 usage events totalling 1,037,777
input tokens, every single one labelled `source = 'builder'`. Joining them back
to `runs` showed 32 of them belonged to live runs and carried 1,021,937 of
those tokens — 98% of consumption filed against the wrong half of the product
on any usage or billing report.

The persistence layer hard-coded the string.
"""

import inspect

import pytest

from agent_service.security.llm_budget import RunLlmBudget, llm_run_budget
from agent_service.supabase_client import Persistence


class TestThePersistenceLayerTakesASource:
    def test_record_llm_usage_event_accepts_one(self):
        sig = inspect.signature(Persistence.record_llm_usage_event)
        assert "source" in sig.parameters

    def test_it_still_defaults_to_builder(self):
        # Builder call sites that do not pass one keep their existing label.
        sig = inspect.signature(Persistence.record_llm_usage_event)
        assert sig.parameters["source"].default == "builder"

    def test_the_string_is_no_longer_hard_coded(self):
        src = inspect.getsource(Persistence.record_llm_usage_event)
        assert '"source": "builder"' not in src
        assert '"source": source' in src


class TestTheBudgetCarriesIt:
    def test_a_budget_defaults_to_builder(self):
        budget = RunLlmBudget(
            run_id="r1", user_id="u1", agent_id="a1", max_calls=10
        )
        assert budget.source == "builder"

    def test_a_budget_can_be_opened_as_live(self):
        budget = RunLlmBudget(
            run_id="r1", user_id="u1", agent_id="a1", max_calls=10, source="live"
        )
        assert budget.source == "live"

    @pytest.mark.asyncio
    async def test_llm_run_budget_passes_the_source_through(self):
        async with llm_run_budget(
            run_id="r1", user_id="u1", agent_id="a1", max_calls=5, source="live"
        ) as budget:
            assert budget.source == "live"

    @pytest.mark.asyncio
    async def test_llm_run_budget_still_defaults_to_builder(self):
        async with llm_run_budget(
            run_id="r1", user_id="u1", agent_id="a1", max_calls=5
        ) as budget:
            assert budget.source == "builder"


class TestLiveRunsDeclareThemselves:
    def test_the_live_runtime_opens_its_budget_as_live(self):
        from agent_service.runtime import live

        src = inspect.getsource(live)
        assert 'source="live"' in src
