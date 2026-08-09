"""Builder quality patterns: router, Plan & Execute, ReAct, self-critique.

Industry practice (Reflexion / ReAct / Plan-and-Execute):
- Outer quality loops stay small (≈3–6) to control tokens.
- Self-critique runs with a VALIDATOR profile before delivery.
- Failed critique routes to ReAct repair or Plan & Execute, then re-verify.
"""

from __future__ import annotations

import logging
from typing import Any, Literal

from pydantic import BaseModel, Field

from agent_service.gateway.model_gateway import ModelGateway, ModelProfile
from agent_service.gateway.router import TaskComplexity

logger = logging.getLogger(__name__)

BuilderPattern = Literal["simple", "react", "plan_execute", "critique"]


class CritiqueResult(BaseModel):
    ok: bool = False
    score: int = Field(default=0, ge=0, le=10)
    issues: list[str] = Field(default_factory=list)
    suggested_fixes: list[str] = Field(default_factory=list)
    next_pattern: Literal["done", "react", "plan_execute", "repair"] = "repair"
    summary: str = ""


class QualityLoopState(BaseModel):
    pattern: BuilderPattern = "simple"
    loops: int = 0
    critiques: list[CritiqueResult] = Field(default_factory=list)
    plan: list[str] = Field(default_factory=list)
    delivered_ok: bool = False


def route_builder_pattern(
    *,
    complexity: TaskComplexity,
    tests_passed: bool,
    tool_count: int = 0,
    critique_failed: bool = False,
    loop_index: int = 0,
) -> BuilderPattern:
    """Deterministic router — the LLM never picks the architecture."""
    if critique_failed and loop_index > 0:
        # After a failed critique: prefer ReAct for targeted fix; plan on first heavy pass.
        return "react" if loop_index >= 2 or tool_count < 4 else "plan_execute"
    if not tests_passed:
        return "react"
    if complexity == TaskComplexity.HEAVY or tool_count >= 5:
        return "plan_execute"
    if complexity == TaskComplexity.FAST and tests_passed:
        return "critique"
    return "react" if tool_count > 0 else "simple"


def default_plan_for_build(*, agent_name: str, user_prompt: str, tests_passed: bool) -> list[str]:
    """Heuristic Plan & Execute skeleton (no LLM required)."""
    goal = (user_prompt or "").strip().replace("\n", " ")[:120]
    plan = [
        f"Clarify objective for {agent_name}: {goal or 'user request'}",
        "Validate AgentSpec identity, tools, and graph",
        "Run smoke / sandbox verification",
    ]
    if not tests_passed:
        plan.append("Repair failures with ReAct (think → act → observe)")
    plan.append("Self-critique result before delivery")
    return plan


async def self_critique(
    *,
    gateway: ModelGateway,
    identity_name: str,
    user_prompt: str,
    test_report: dict[str, Any],
    status: str,
    file_paths: list[str] | None = None,
    prior_issues: list[str] | None = None,
) -> CritiqueResult:
    """Autocritique: VALIDATOR model scores the build before user delivery."""
    test_status = str(test_report.get("status") or "unknown")
    reason = str(test_report.get("reason") or test_report.get("error_code") or "")[:400]
    files = ", ".join((file_paths or [])[:10]) or "(none)"
    prior = "\n".join(f"- {i}" for i in (prior_issues or [])[:6]) or "- (none)"

    # Hard fail without spending tokens when smoke already failed.
    if test_status == "failed":
        return CritiqueResult(
            ok=False,
            score=3,
            issues=[reason or "Verification did not pass"],
            suggested_fixes=["Repair failing checks then re-run smoke tests"],
            next_pattern="react",
            summary="Verification failed — critique short-circuited to repair.",
        )

    try:
        result = await gateway.complete(
            profile=ModelProfile.VALIDATOR,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are Stack32 Build Critic. Score whether this agent build is "
                        "safe to show the user as done. Be strict about broken tests, "
                        "missing tools, vague identity, or claims without verification. "
                        "Return ONLY JSON matching the schema."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Agent: {identity_name}\n"
                        f"User request: {user_prompt[:1500]}\n"
                        f"Pipeline status: {status}\n"
                        f"Smoke/test: {test_status}\n"
                        f"Test detail: {reason or '(ok)'}\n"
                        f"Files: {files}\n"
                        f"Prior issues:\n{prior}\n\n"
                        "Decide if delivery is acceptable."
                    ),
                },
            ],
            response_model=CritiqueResult,
            temperature=0.1,
            max_tokens=500,
        )
        if isinstance(result, CritiqueResult):
            passed = str(test_report.get("status") or "").startswith("passed")
            if not passed:
                result.ok = False
                result.next_pattern = "react"
            elif result.score <= 0 and not result.issues:
                # Empty/default structured output — trust smoke verification.
                result.ok = True
                result.score = 7
                result.next_pattern = "done"
                result.summary = "Smoke passed; critic returned an empty score — accepting build."
            elif passed and result.score >= 6:
                result.ok = True
                result.next_pattern = "done"
            return result
    except Exception:  # noqa: BLE001
        logger.exception("self_critique_failed")

    # Conservative fallback: pass only when tests passed.
    passed = str(test_report.get("status") or "").startswith("passed")
    return CritiqueResult(
        ok=passed and status in {"ready", "needs_setup"},
        score=7 if passed else 2,
        issues=[] if passed else ["Critique unavailable; verification incomplete"],
        suggested_fixes=[] if passed else ["Re-run verification and repair"],
        next_pattern="done" if passed else "repair",
        summary="Fallback critique from verification status.",
    )


def critique_to_repair_reason(critique: CritiqueResult) -> str:
    parts = list(critique.issues[:4]) + list(critique.suggested_fixes[:3])
    if critique.summary:
        parts.insert(0, critique.summary)
    return "; ".join(p for p in parts if p)[:800] or "Self-critique requested improvements"


def max_quality_loops(settings: Any, *, tests_passed: bool = False) -> int:
    """Outer loops before delivery. Fewer when smoke already passed."""
    configured = int(getattr(settings, "MAX_QUALITY_LOOPS", 6) or 6)
    if tests_passed:
        # Avoid burning tokens re-repairing a green build after a flaky critic.
        return min(configured, 2)
    return configured
