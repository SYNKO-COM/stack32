"""Spec diff guard — reject repair mutations outside RepairContract scope."""

from __future__ import annotations

from typing import Any

from agent_service.builder.repair_contract import RepairContract
from agent_service.builder.tool_review import reviewable_app_keys
from agent_service.models.agent_spec import AgentSpec, ToolBinding


def _spec_tool_app_keys(spec: AgentSpec) -> set[str]:
    return reviewable_app_keys(list(spec.tools or []))


def spec_sections_snapshot(spec: AgentSpec) -> dict[str, Any]:
    return {
        "identity": spec.identity.model_dump(mode="json") if spec.identity else {},
        "goal": spec.goal,
        "tools_app_keys": sorted(_spec_tool_app_keys(spec)),
        "memory": spec.memory.model_dump(mode="json"),
        "triggers": [t.model_dump(mode="json") for t in (spec.triggers or [])],
        "model": spec.model.model_dump(mode="json") if spec.model else {},
    }


def diff_spec_violations(
    *,
    before: AgentSpec,
    after: AgentSpec,
    contract: RepairContract,
) -> list[str]:
    """Return human-readable violations; empty list means scope OK."""
    violations: list[str] = []
    b = spec_sections_snapshot(before)
    a = spec_sections_snapshot(after)
    protected = contract.protected_scope or {}

    if protected.get("identity") and a["identity"] != b["identity"]:
        violations.append("identity changed")
    if protected.get("memory") and a["memory"] != b["memory"]:
        violations.append("memory changed")
    if protected.get("triggers") and a["triggers"] != b["triggers"]:
        violations.append("triggers changed")
    if protected.get("model_policy") and a["model"] != b["model"]:
        violations.append("model configuration changed")

    if protected.get("tool_set") and not contract.explicit_user_tool_change:
        before_apps = set(b["tools_app_keys"])
        after_apps = set(a["tools_app_keys"])
        frozen = set(contract.frozen_app_keys or [])
        if frozen:
            before_apps = frozen & before_apps if frozen else before_apps
        if after_apps != before_apps:
            added = after_apps - before_apps
            removed = before_apps - after_apps
            if added:
                violations.append(f"tools added without approval: {sorted(added)}")
            if removed:
                violations.append(f"tools removed without approval: {sorted(removed)}")

    return violations


def enforce_spec_diff_guard(
    *,
    before: AgentSpec,
    after: AgentSpec,
    contract: RepairContract,
) -> AgentSpec:
    """Return `after` if valid; otherwise raise ValueError with violations."""
    violations = diff_spec_violations(before=before, after=after, contract=contract)
    if violations:
        msg = (
            "Repair contract violated — unrelated state changed: "
            + "; ".join(violations)
            + ". Undo those changes and solve the original issue surgically."
        )
        raise ValueError(msg)
    return after


def filter_unauthorized_tool_bindings(
    proposed: list[ToolBinding],
    *,
    contract: RepairContract,
    current: list[ToolBinding] | None,
) -> list[ToolBinding]:
    """Drop unsolicited app changes during repair."""
    if contract.explicit_user_tool_change:
        return proposed
    current_keys = _spec_tool_app_keys(AgentSpec(goal="", tools=list(current or [])))
    proposed_keys = reviewable_app_keys(proposed)
    if proposed_keys == current_keys:
        return proposed
    # Keep only bindings whose app keys existed before (+ builtins).
    allowed = current_keys | set(contract.frozen_app_keys or [])
    out: list[ToolBinding] = []
    for binding in proposed:
        from agent_service.integrations.app_keys import app_key_from_tool_id

        app = app_key_from_tool_id(binding.tool_id, app_id=binding.app_id)
        if binding.tool_id in {"current_datetime", "structured_output"}:
            out.append(binding)
            continue
        if app in allowed or app in current_keys:
            out.append(binding)
    return out if out else list(current or [])


def clamp_spec_to_repair_contract(
    *,
    before: AgentSpec,
    after: AgentSpec,
    contract: RepairContract,
) -> AgentSpec:
    """Revert protected sections when the LLM over-scoped a repair."""
    violations = diff_spec_violations(before=before, after=after, contract=contract)
    if not violations:
        return after
    data = after.model_dump()
    b = spec_sections_snapshot(before)
    protected = contract.protected_scope or {}
    if protected.get("identity"):
        data["identity"] = b["identity"]
    if protected.get("memory"):
        data["memory"] = b["memory"]
    if protected.get("triggers"):
        data["triggers"] = b["triggers"]
    if protected.get("model_policy"):
        data["model"] = b["model"]
    if protected.get("tool_set") and not contract.explicit_user_tool_change:
        data["tools"] = [t.model_dump(mode="json") for t in (before.tools or [])]
    return AgentSpec.model_validate(data)
