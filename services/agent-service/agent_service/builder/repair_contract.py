"""Structured repair contract — scope and success criteria before mutation."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


Confidence = Literal["low", "medium", "high"]


class RepairContract(BaseModel):
    repair_id: str
    user_request: str = Field(max_length=4000)
    original_agent_goal: str = Field(default="", max_length=4000)
    reported_failure: str = Field(default="", max_length=2000)
    failure_evidence: dict[str, Any] = Field(default_factory=dict)
    baseline_version_id: str | None = None
    baseline_snapshot_id: str | None = None

    allowed_scope: dict[str, Any] = Field(
        default_factory=lambda: {
            "files": True,
            "agent_spec_sections": ["instructions", "tools.bindings", "graph"],
            "integration_app": True,
            "runtime_subsystem": True,
        }
    )
    protected_scope: dict[str, bool] = Field(
        default_factory=lambda: {
            "tool_set": True,
            "triggers": True,
            "memory": True,
            "model_policy": True,
            "identity": True,
            "unrelated_integrations": True,
        }
    )
    explicit_user_tool_change: bool = False
    success_criteria: list[str] = Field(default_factory=list)
    reproduction_steps: list[str] = Field(default_factory=list)
    confidence: Confidence = "medium"

    frozen_app_keys: list[str] = Field(default_factory=list)


def build_repair_contract(
    *,
    repair_id: str,
    user_request: str,
    original_goal: str,
    reported_failure: str = "",
    failure_evidence: dict[str, Any] | None = None,
    baseline_version_id: str | None = None,
    baseline_snapshot_id: str | None = None,
    frozen_app_keys: list[str] | None = None,
    explicit_user_tool_change: bool = False,
) -> RepairContract:
    """Deterministic contract skeleton; LLM may enrich success_criteria later."""
    req = (user_request or "").strip()
    criteria = [
        "Fix the reported failure without changing unrelated agent behavior.",
        "Preserve protected scope unless the user explicitly requested a structural tool change.",
    ]
    repro: list[str] = []
    if "TOOL_NOT_ALLOWED" in (reported_failure or req).upper():
        repro.append("Re-run the failing tool action and confirm it is allowed and configured.")
    if "google_sheets" in req.lower() or "sheets" in req.lower():
        repro.append("Attempt add-row/write against configured Google Sheets binding.")

    return RepairContract(
        repair_id=repair_id,
        user_request=req[:4000],
        original_agent_goal=(original_goal or "")[:4000],
        reported_failure=(reported_failure or req)[:2000],
        failure_evidence=dict(failure_evidence or {}),
        baseline_version_id=baseline_version_id,
        baseline_snapshot_id=baseline_snapshot_id,
        explicit_user_tool_change=explicit_user_tool_change,
        success_criteria=criteria,
        reproduction_steps=repro,
        frozen_app_keys=list(frozen_app_keys or []),
        confidence="medium" if reported_failure else "low",
    )
