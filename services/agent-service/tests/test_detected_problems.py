"""Tests for user-facing detected problem summaries."""

from __future__ import annotations

from types import SimpleNamespace

from agent_service.builder.orchestrator import summarize_detected_problems


def test_summarize_detected_problems_smoke_and_connection() -> None:
    readiness = SimpleNamespace(
        checks=[
            SimpleNamespace(ok=False, severity="error", message="Tool gmail_send_message unresolved"),
            SimpleNamespace(ok=True, severity="info", message="ok"),
        ],
        missing_connections=[{"provider": "google"}],
        missing_config=[],
    )
    problems = summarize_detected_problems(
        status="needs_attention",
        test_report={"status": "failed", "reason": "GRAPH_INVALID"},
        readiness=readiness,
        build_ok=False,
        build_failure_reason="tests failed",
    )
    assert any("sandbox" in p.lower() or "vérification" in p.lower() for p in problems)
    assert any("test rapide" in p.lower() for p in problems)
    assert any("gmail_send_message" in p for p in problems)
    assert any("google" in p.lower() for p in problems)
    # readiness.build_ok message must not duplicate the sandbox bullet
    assert not any(p == "Latest build did not succeed." for p in problems)
    assert len(problems) <= 5


def test_summarize_detected_problems_fallback() -> None:
    problems = summarize_detected_problems(status="needs_attention")
    assert problems == ["Stack32 found something to adjust before your agent is ready."]
