"""A Discord-born run must light the tool trigger, not the chat branch.

The trigger service stamps ``trigger_kind: "tool"`` and ``trigger_id`` into
the run's input when a Pipedream event creates it. The runtime used to check
only ``schedule_id`` and defaulted everything else to ``chat`` — so the live
structure animated the Chat node for every Discord event.
"""

from __future__ import annotations

import pathlib

RUNTIME = (
    pathlib.Path(__file__).resolve().parents[1]
    / "agent_service/runtime/langgraph_runtime.py"
).read_text()


class TestTheRuntimeReadsTheRunsOrigin:
    def test_schedule_runs_stay_schedule(self):
        assert 'run_input.get("schedule_id")' in RUNTIME

    def test_tool_born_runs_are_recognized(self):
        assert 'run_input.get("trigger_kind") == "tool"' in RUNTIME
        assert 'run_input.get("trigger_id")' in RUNTIME

    def test_tool_check_comes_after_schedule(self):
        # Schedule stays the more specific branch; tool is the elif.
        assert RUNTIME.index('run_input.get("schedule_id")') < RUNTIME.index(
            'run_input.get("trigger_kind") == "tool"'
        )


class TestTheTriggerServiceStampsTheOrigin:
    def test_the_event_run_carries_its_kind(self):
        service = (
            pathlib.Path(__file__).resolve().parents[1]
            / "agent_service/triggers/service.py"
        ).read_text()
        assert '"trigger_kind": "tool"' in service
