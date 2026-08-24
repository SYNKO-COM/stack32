"""The identity card must speak the app's language and name the mission.

A French dunning prompt got back "Goal Guide — Helps users clarify goals and
turn them into actionable plans": English, and generic enough to fit any
agent. The suggestion call never told the model the app language, nor that
the name had to reflect this mission.
"""

import inspect

from agent_service.builder import orchestrator


def test_the_call_carries_the_locale():
    src = inspect.getsource(orchestrator.BuilderOrchestrator._suggest_identity)
    assert 'locale: str = "en"' in src or "locale: str" in src
    assert "FRENCH" in src


def test_the_prompt_forbids_a_generic_name():
    src = inspect.getsource(orchestrator.BuilderOrchestrator._suggest_identity)
    assert "THIS mission" in src


def test_the_caller_passes_it():
    src = inspect.getsource(orchestrator.BuilderOrchestrator.execute_build_run)
    assert "_suggest_identity(content, locale=locale)" in src
