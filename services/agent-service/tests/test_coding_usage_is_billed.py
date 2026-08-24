"""Money the coding pipeline spends has to reach the ledger.

Anthropic's console showed $9.08 on a key named Stack32, almost all of it
Claude Sonnet 5, while `llm_usage_events` held not one Anthropic row and the
credit gauge read 42 of 200. The service logs settled it: 412 LiteLLM lines for
claude-sonnet-5 against 42 for gpt-5.6-sol over the same day — the coding repair
loop escalating to the external expert, exactly as designed, and none of it
billed.

The budget for that loop was opened with `run_id=f"{run_id}:coding"`. The
column is a uuid, so every insert was rejected, and the write path logged the
rejection at debug and moved on. Real spend, invisible ledger, silent failure.
"""

import inspect
import uuid

from agent_service.builder import build_pipeline
from agent_service.security import llm_budget


class TestTheCodingBudgetCarriesARealRunId:
    def test_it_no_longer_appends_a_suffix(self):
        src = inspect.getsource(build_pipeline)
        assert 'run_id=f"{run_id}:coding"' not in src

    def test_the_scope_moved_to_source_which_is_text(self):
        src = inspect.getsource(build_pipeline)
        assert 'source="coding"' in src

    def test_a_plain_uuid_survives_the_round_trip(self):
        run_id = str(uuid.uuid4())
        budget = llm_budget.RunLlmBudget(
            run_id=run_id, user_id="u", agent_id="a", max_calls=5, source="coding"
        )
        # The column is a uuid; anything the pipeline hands over must parse.
        assert uuid.UUID(budget.run_id)
        assert budget.source == "coding"

    def test_the_old_shape_would_not_have_parsed(self):
        try:
            uuid.UUID(f"{uuid.uuid4()}:coding")
        except ValueError:
            return
        raise AssertionError("expected the suffixed id to be rejected as a uuid")


class TestAFailedWriteIsNoLongerSilent:
    def test_it_is_reported_at_warning(self):
        src = inspect.getsource(llm_budget.RunLlmBudget._record_per_call_event)
        assert "llm_usage_event_write_failed" in src
        assert 'logger.debug("llm_usage_event write skipped"' not in src

    def test_the_message_names_what_was_lost(self):
        src = inspect.getsource(llm_budget.RunLlmBudget._record_per_call_event)
        # Without the run, the model and the source, an alert cannot be acted on.
        assert "self.run_id" in src
        assert "self.source" in src
