"""Mandatory human confirmation before any tool add/remove."""

from __future__ import annotations

from typing import Any

from agent_service.models.agent_spec import ToolBinding

# Infrastructure tools — always present, not shown in the review UI.
PROTECTED_TOOL_IDS = frozenset({"current_datetime", "structured_output"})


def enabled_tool_ids(tools: list[ToolBinding] | None) -> set[str]:
    return {
        t.tool_id
        for t in (tools or [])
        if t.enabled and t.tool_id not in PROTECTED_TOOL_IDS
    }


def tools_changed(
    *,
    proposed: list[ToolBinding],
    current: list[ToolBinding] | None,
) -> bool:
    """True when the non-protected enabled tool set differs (or first build)."""
    if current is None:
        return True
    return enabled_tool_ids(proposed) != enabled_tool_ids(current)


def _human_label(tool: ToolBinding) -> str:
    raw = (tool.app_id or tool.tool_id or "tool").replace("_", " ").replace("-", " ")
    return " ".join(part.capitalize() for part in raw.split() if part)[:80]


def default_utility(tool: ToolBinding, *, change: str, goal: str = "") -> str:
    cfg = tool.config if isinstance(tool.config, dict) else {}
    for key in ("utility", "purpose", "reason"):
        value = cfg.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()[:500]
    label = _human_label(tool)
    if change == "remove":
        return f"Stack32 proposes removing {label} from this agent."
    goal_bit = (goal or "").strip()
    if goal_bit:
        return f"Lets the agent use {label} toward: {goal_bit[:160]}"
    return f"Lets the agent use {label} to complete its job."


def build_tool_review_entries(
    *,
    proposed: list[ToolBinding],
    current: list[ToolBinding] | None,
    goal: str = "",
) -> list[dict[str, Any]]:
    """Build UI rows for the tool review form (excludes protected builtins)."""
    current_by_id = {
        t.tool_id: t
        for t in (current or [])
        if t.enabled and t.tool_id not in PROTECTED_TOOL_IDS
    }
    proposed_by_id = {
        t.tool_id: t
        for t in proposed
        if t.enabled and t.tool_id not in PROTECTED_TOOL_IDS
    }

    entries: list[dict[str, Any]] = []
    for tool_id, tool in proposed_by_id.items():
        change = "keep" if tool_id in current_by_id else "add"
        entries.append(
            {
                "tool_id": tool.tool_id,
                "name": _human_label(tool),
                "provider": tool.provider or "native",
                "app_id": tool.app_id,
                "external_action_id": tool.external_action_id,
                "utility": default_utility(tool, change=change, goal=goal),
                "change": change,
                "removable": True,
            }
        )

    # Tools Stack32 wants to drop — still visible so the user can keep them.
    for tool_id, tool in current_by_id.items():
        if tool_id in proposed_by_id:
            continue
        entries.append(
            {
                "tool_id": tool.tool_id,
                "name": _human_label(tool),
                "provider": tool.provider or "native",
                "app_id": tool.app_id,
                "external_action_id": tool.external_action_id,
                "utility": default_utility(tool, change="remove", goal=goal),
                "change": "remove",
                "removable": True,
            }
        )

    order = {"add": 0, "keep": 1, "remove": 2}
    entries.sort(key=lambda e: (order.get(str(e.get("change")), 9), str(e.get("name") or "")))
    return entries


def apply_reviewed_tools(
    *,
    pending_tools: list[ToolBinding],
    reviewed: list[dict[str, Any]],
) -> list[ToolBinding]:
    """Apply the user's confirmed tool list onto the pending bindings."""
    pending_by_id = {t.tool_id: t for t in pending_tools}
    out: list[ToolBinding] = []
    seen: set[str] = set()

    # Keep protected builtins from the pending spec first.
    for tool in pending_tools:
        if tool.tool_id in PROTECTED_TOOL_IDS and tool.tool_id not in seen:
            seen.add(tool.tool_id)
            out.append(tool)

    for raw in reviewed:
        tool_id = str(raw.get("tool_id") or "").strip()
        if not tool_id or tool_id in PROTECTED_TOOL_IDS or tool_id in seen:
            continue
        utility = str(raw.get("utility") or "").strip()[:500]
        base = pending_by_id.get(tool_id)
        provider = str(raw.get("provider") or (base.provider if base else "native"))[:64]
        app_id = raw.get("app_id")
        if app_id is not None:
            app_id = str(app_id).strip()[:128] or None
        elif base is not None:
            app_id = base.app_id
        external_action_id = raw.get("external_action_id")
        if external_action_id is not None:
            external_action_id = str(external_action_id).strip()[:256] or None
        elif base is not None:
            external_action_id = base.external_action_id

        config: dict[str, Any] = dict(base.config) if base and isinstance(base.config, dict) else {}
        if utility:
            config["utility"] = utility

        if base is not None:
            out.append(
                base.model_copy(
                    update={
                        "enabled": True,
                        "provider": provider,
                        "app_id": app_id,
                        "external_action_id": external_action_id,
                        "config": config,
                    }
                )
            )
        else:
            out.append(
                ToolBinding(
                    tool_id=tool_id[:128],
                    provider=provider or "pipedream",
                    app_id=app_id,
                    external_action_id=external_action_id,
                    enabled=True,
                    config=config,
                )
            )
        seen.add(tool_id)

    # Ensure builtins exist even if pending was empty.
    for bid in PROTECTED_TOOL_IDS:
        if bid not in seen:
            out.insert(0, ToolBinding(tool_id=bid, provider="native", enabled=True))
            seen.add(bid)

    return out[:20]
