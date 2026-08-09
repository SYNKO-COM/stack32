"""Unit tests for Builder quality patterns (router + critique gate)."""

from __future__ import annotations

import pytest

from agent_service.builder.quality_gate import (
    CritiqueResult,
    critique_to_repair_reason,
    default_plan_for_build,
    route_builder_pattern,
    self_critique,
)
from agent_service.gateway.router import TaskComplexity


def test_route_builder_pattern_heavy_uses_plan_execute():
    assert (
        route_builder_pattern(
            complexity=TaskComplexity.HEAVY,
            tests_passed=True,
            tool_count=6,
        )
        == "plan_execute"
    )


def test_route_builder_pattern_failed_tests_uses_react():
    assert (
        route_builder_pattern(
            complexity=TaskComplexity.STANDARD,
            tests_passed=False,
            tool_count=2,
        )
        == "react"
    )


def test_route_builder_pattern_after_critique_failure():
    assert (
        route_builder_pattern(
            complexity=TaskComplexity.HEAVY,
            tests_passed=True,
            tool_count=6,
            critique_failed=True,
            loop_index=1,
        )
        == "plan_execute"
    )
    assert (
        route_builder_pattern(
            complexity=TaskComplexity.HEAVY,
            tests_passed=True,
            tool_count=6,
            critique_failed=True,
            loop_index=2,
        )
        == "react"
    )


def test_default_plan_includes_critique():
    plan = default_plan_for_build(
        agent_name="Helper",
        user_prompt="build a homework helper",
        tests_passed=False,
    )
    assert any("Self-critique" in step for step in plan)
    assert any("ReAct" in step for step in plan)


def test_critique_to_repair_reason():
    c = CritiqueResult(
        ok=False,
        score=4,
        issues=["Graph incomplete"],
        suggested_fixes=["Reset linear graph"],
        summary="Needs repair",
    )
    text = critique_to_repair_reason(c)
    assert "Needs repair" in text
    assert "Graph incomplete" in text


@pytest.mark.asyncio
async def test_self_critique_short_circuits_on_failed_tests():
    class _GW:
        async def complete(self, **kwargs):  # pragma: no cover
            raise AssertionError("should not call model when tests failed")

    result = await self_critique(
        gateway=_GW(),  # type: ignore[arg-type]
        identity_name="Helper",
        user_prompt="fix it",
        test_report={"status": "failed", "reason": "GRAPH_INVALID"},
        status="needs_attention",
    )
    assert result.ok is False
    assert result.next_pattern == "react"
    assert "GRAPH_INVALID" in result.issues[0]


@pytest.mark.asyncio
async def test_self_critique_accepts_empty_score_when_tests_passed():
    class _GW:
        async def complete(self, **kwargs):
            return CritiqueResult(
                ok=False,
                score=0,
                issues=[],
                suggested_fixes=[],
                next_pattern="react",
                summary="",
            )

    result = await self_critique(
        gateway=_GW(),  # type: ignore[arg-type]
        identity_name="Helper",
        user_prompt="fix it",
        test_report={"status": "passed", "reason": ""},
        status="ready",
    )
    assert result.ok is True
    assert result.score >= 6
    assert result.next_pattern == "done"


def test_max_quality_loops_caps_when_tests_passed():
    from agent_service.builder.quality_gate import max_quality_loops

    class _S:
        MAX_QUALITY_LOOPS = 6

    assert max_quality_loops(_S(), tests_passed=True) == 2
    assert max_quality_loops(_S(), tests_passed=False) == 6
