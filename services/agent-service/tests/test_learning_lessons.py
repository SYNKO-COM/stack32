"""Unit tests for Builder learning lessons (no network)."""

from __future__ import annotations

from agent_service.learning.lessons import (
    format_lessons_for_prompt,
    normalize_error_signature,
)


def test_normalize_error_signature_strips_pii_noise() -> None:
    a = normalize_error_signature(
        error_code="TOOL_FAILED",
        reason="User a@b.com hit https://example.com id 11111111-1111-1111-1111-111111111111",
    )
    b = normalize_error_signature(
        error_code="TOOL_FAILED",
        reason="User x@y.com hit https://other.test id 22222222-2222-2222-2222-222222222222",
    )
    assert a == b
    assert len(a) == 32


def test_format_lessons_for_prompt() -> None:
    text = format_lessons_for_prompt(
        [
            {
                "error_code": "GRAPH_INVALID",
                "reason": "missing entry node",
                "resolution_summary": "reset linear graph",
            }
        ]
    )
    assert "GRAPH_INVALID" in text
    assert "reset linear graph" in text
    assert format_lessons_for_prompt([]) == ""
