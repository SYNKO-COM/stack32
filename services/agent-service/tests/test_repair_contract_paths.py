"""Tests for repair contract, spec guard, and behavior verification."""

from __future__ import annotations

from agent_service.builder.repair_contract import build_repair_contract
from agent_service.builder.spec_diff_guard import (
    clamp_spec_to_repair_contract,
    diff_spec_violations,
)
from agent_service.models.agent_spec import (
    AgentIdentity,
    AgentInstructions,
    AgentSpec,
    ToolBinding,
)
from agent_service.models.graph_spec import default_linear_graph
from agent_service.verifier.behavior import behavior_gate_for_repair
from agent_service.verifier.diff_review import review_repair_diff


def _spec(tools: list[str], goal: str = "Handle email") -> AgentSpec:
    bindings = [ToolBinding(tool_id=t, enabled=True) for t in tools]
    return AgentSpec(
        identity=AgentIdentity(name="Test", role="Assistant"),
        goal=goal,
        instructions=AgentInstructions(system="Test agent"),
        tools=bindings,
        graph=default_linear_graph(tools or ["current_datetime"]),
    )


def test_repair_contract_includes_reproduction_for_sheets():
    contract = build_repair_contract(
        repair_id="r1",
        user_request="Fix google sheets add row",
        original_goal="Sheets agent",
        reported_failure="TOOL_NOT_ALLOWED",
    )
    assert contract.reproduction_steps
    assert any("Sheets" in step for step in contract.reproduction_steps)


def test_spec_diff_guard_rejects_unauthorized_tools():
    before = _spec(["pd:gmail-send-email"])
    after = _spec(["pd:gmail-send-email", "pd:supabase-insert-row"])
    contract = build_repair_contract(
        repair_id="r2",
        user_request="fix gmail",
        original_goal="email",
        frozen_app_keys=["gmail"],
    )
    violations = diff_spec_violations(before=before, after=after, contract=contract)
    assert violations
    clamped = clamp_spec_to_repair_contract(before=before, after=after, contract=contract)
    assert len(clamped.tools) == 1


def test_diff_review_requires_tests_and_lint():
    contract = build_repair_contract(repair_id="r3", user_request="fix", original_goal="g")
    result = review_repair_diff(
        contract=contract,
        spec_before=None,
        spec_after=_spec([]),
        files_changed=["main.py"],
        test_status="failed",
        lint_status="passed",
    )
    assert result.outcome == "REPAIR_REQUIRED"


def test_behavior_connection_required_on_tool_failure():
    spec = _spec(["pd:google_sheets-add-row"])
    report = behavior_gate_for_repair(
        spec,
        failure_evidence={"error_code": "TOOL_NOT_ALLOWED"},
    )
    assert report.status == "CONNECTION_REQUIRED"
