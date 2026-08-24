"""The queue must not strip the person's language from a build turn.

A French user typed a settings message; the reply came back in English. The
run payload carried "locale": "fr" the whole way — handle_message stored it —
and the Cloud Tasks worker rebuilt the call without it, so every queued
builder turn fell back to the default.
"""

import inspect


def test_the_worker_passes_the_payload_locale_through():
    from agent_service.queue import worker

    src = inspect.getsource(worker)
    assert 'payload.get("locale")' in src
    # And it hands it to the orchestrator rather than reading it for nothing.
    assert "locale=locale" in src


def test_the_orchestrator_stores_it_where_the_worker_reads():
    from agent_service.builder import orchestrator

    src = inspect.getsource(orchestrator.BuilderOrchestrator.handle_message)
    assert '"locale": locale' in src
