"""Diff review + structured validation outcome for coding repairs."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from agent_service.builder.repair_contract import RepairContract
from agent_service.builder.spec_diff_guard import diff_spec_violations
from agent_service.models.agent_spec import AgentSpec

ValidationOutcome = Literal["PASS", "REPAIR_REQUIRED", "USER_INPUT_REQUIRED"]


class DiffReviewResult(BaseModel):
    outcome: ValidationOutcome
    violations: list[str] = Field(default_factory=list)
    files_changed: list[str] = Field(default_factory=list)
    summary: str = ""


def review_repair_diff(
    *,
    contract: RepairContract,
    spec_before: AgentSpec | None,
    spec_after: AgentSpec,
    files_changed: list[str],
    test_status: str,
    lint_status: str,
) -> DiffReviewResult:
    violations: list[str] = []
    if spec_before is not None:
        violations.extend(
            diff_spec_violations(before=spec_before, after=spec_after, contract=contract)
        )

    if test_status != "passed":
        return DiffReviewResult(
            outcome="REPAIR_REQUIRED",
            violations=violations,
            files_changed=files_changed,
            summary="Tests must pass before repair is complete.",
        )
    if lint_status != "passed":
        return DiffReviewResult(
            outcome="REPAIR_REQUIRED",
            violations=violations,
            files_changed=files_changed,
            summary="Lint must pass before repair is complete.",
        )
    if violations:
        return DiffReviewResult(
            outcome="REPAIR_REQUIRED",
            violations=violations,
            files_changed=files_changed,
            summary="Changes outside repair contract scope must be reverted.",
        )
    return DiffReviewResult(
        outcome="PASS",
        violations=[],
        files_changed=files_changed,
        summary="Repair diff satisfies contract and verification gates.",
    )
