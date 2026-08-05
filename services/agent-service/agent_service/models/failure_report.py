"""Structured failure report for typed agent repair."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class SuggestedPatch(BaseModel):
    kind: Literal[
        "reset_linear_graph",
        "add_tool",
        "append_system_instruction",
        "disable_tool",
        "enable_knowledge",
        "enable_memory",
    ]
    tool_id: str | None = None
    text: str | None = None
    reason: str = ""


class AgentFailureReport(BaseModel):
    status: Literal["passed", "passed_with_warnings", "failed"] = "failed"
    failed_node: str | None = None
    error_code: str | None = None
    reason: str = ""
    input: str = ""
    visited: list[str] = Field(default_factory=list)
    suggested_patches: list[SuggestedPatch] = Field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump()


def failure_from_smoke(
    *,
    status: str,
    reason: str = "",
    input_text: str = "",
    visited: list[str] | None = None,
    error_code: str | None = None,
) -> AgentFailureReport:
    visited = visited or []
    patches: list[SuggestedPatch] = []
    if status == "failed":
        patches.append(
            SuggestedPatch(
                kind="reset_linear_graph",
                reason="Restore a shallow validated linear graph",
            )
        )
        if "tool" in reason.lower() or "TOOL" in (error_code or ""):
            patches.append(
                SuggestedPatch(
                    kind="add_tool",
                    tool_id="current_datetime",
                    reason="Ensure a safe baseline tool is available",
                )
            )
        patches.append(
            SuggestedPatch(
                kind="append_system_instruction",
                text="Follow safety policies. Prefer concise accurate answers.",
                reason="Reinforce safety and brevity after failure",
            )
        )
    return AgentFailureReport(
        status=status if status in ("passed", "passed_with_warnings", "failed") else "failed",  # type: ignore[arg-type]
        failed_node=visited[-1] if visited else None,
        error_code=error_code or (reason if reason.isupper() else None),
        reason=reason,
        input=input_text,
        visited=visited,
        suggested_patches=patches,
    )
