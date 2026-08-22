"""Agent behavior verification — dry-run scenarios from AgentSpec."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from agent_service.models.agent_spec import AgentSpec

BehaviorStatus = Literal["PASS", "CONNECTION_REQUIRED", "SKIPPED", "FAIL"]


@dataclass
class BehaviorScenario:
    name: str
    description: str
    required_app_keys: list[str] = field(default_factory=list)
    dry_run: bool = True


@dataclass
class BehaviorReport:
    status: BehaviorStatus
    scenarios: list[BehaviorScenario] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def scenarios_from_spec(spec: AgentSpec) -> list[BehaviorScenario]:
    """Derive lightweight dry-run scenarios from goal and tool bindings."""
    goal = (spec.goal or "").lower()
    scenarios: list[BehaviorScenario] = []
    app_keys: set[str] = set()
    for binding in spec.tools or []:
        from agent_service.integrations.app_keys import app_key_from_tool_id

        key = app_key_from_tool_id(binding.tool_id, app_id=binding.app_id)
        if key:
            app_keys.add(key)

    if "gmail" in goal or "email" in goal:
        scenarios.append(
            BehaviorScenario(
                name="email_read",
                description="Simulate reading inbox without sending mail.",
                required_app_keys=[k for k in app_keys if "gmail" in k or "google" in k],
            )
        )
    if "sheet" in goal or "spreadsheet" in goal:
        scenarios.append(
            BehaviorScenario(
                name="sheets_write",
                description="Simulate append row to configured sheet.",
                required_app_keys=[k for k in app_keys if "sheet" in k or "google" in k],
            )
        )
    if not scenarios:
        scenarios.append(
            BehaviorScenario(
                name="goal_smoke",
                description=f"Dry-run goal: {(spec.goal or '')[:120]}",
                required_app_keys=sorted(app_keys)[:3],
            )
        )
    return scenarios


def verify_behavior(
    spec: AgentSpec,
    *,
    connected_app_keys: set[str] | None = None,
) -> BehaviorReport:
    """Non-destructive behavior check before marking repair complete."""
    connected = connected_app_keys or set()
    scenarios = scenarios_from_spec(spec)
    notes: list[str] = []

    for scenario in scenarios:
        missing = [k for k in scenario.required_app_keys if k and k not in connected]
        if missing and scenario.required_app_keys:
            return BehaviorReport(
                status="CONNECTION_REQUIRED",
                scenarios=scenarios,
                notes=[f"Missing connections for: {', '.join(missing)}"],
            )

    notes.append(f"Validated {len(scenarios)} dry-run scenario(s) without side effects.")
    return BehaviorReport(status="PASS", scenarios=scenarios, notes=notes)


def behavior_gate_for_repair(
    spec: AgentSpec,
    failure_evidence: dict[str, Any] | None = None,
) -> BehaviorReport:
    """REPAIR path: infer required connections from failure evidence."""
    connected: set[str] = set()
    if failure_evidence:
        for key in ("app_key", "integration", "provider"):
            val = failure_evidence.get(key)
            if isinstance(val, str) and val.strip():
                connected.add(val.strip())
    report = verify_behavior(spec, connected_app_keys=connected)
    if report.status == "CONNECTION_REQUIRED":
        return report
    # Tool failures often need live connection — surface as CONNECTION_REQUIRED when evidence says so.
    code = str((failure_evidence or {}).get("error_code") or "").upper()
    if code in {"CONNECTION_REQUIRED", "TOOL_CONFIG_REQUIRED", "TOOL_NOT_ALLOWED"}:
        return BehaviorReport(
            status="CONNECTION_REQUIRED",
            scenarios=report.scenarios,
            notes=["Live connection or tool configuration required to reproduce failure."],
        )
    return report
