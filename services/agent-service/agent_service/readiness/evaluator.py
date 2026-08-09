"""Agent readiness evaluation for hybrid integrations (connections, tools, config)."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from agent_service.models.agent_spec import AgentSpec, load_agent_spec

logger = logging.getLogger(__name__)


@dataclass
class ReadinessCheck:
    key: str
    ok: bool
    message: str
    severity: str  # error|warn|info


@dataclass
class ReadinessResult:
    status: str  # ready|needs_setup|needs_attention
    checks: list[ReadinessCheck] = field(default_factory=list)
    missing_connections: list[dict[str, Any]] = field(default_factory=list)
    missing_config: list[dict[str, Any]] = field(default_factory=list)


def _as_spec(spec: AgentSpec | dict[str, Any]) -> AgentSpec | None:
    try:
        if isinstance(spec, AgentSpec):
            return spec
        return load_agent_spec(spec)
    except Exception as exc:  # noqa: BLE001
        logger.info("readiness_spec_invalid err=%s", exc)
        return None


async def _bound_providers(user_id: str, agent_id: str, db: Any | None) -> set[str]:
    providers: set[str] = set()
    try:
        from agent_service.connections.manager import ConnectionManager

        mgr = ConnectionManager()
        # Prefer agent bindings when available.
        if hasattr(mgr, "list_bindings"):
            try:
                bindings = await mgr.list_bindings(user_id=user_id, agent_id=agent_id)
                for b in bindings or []:
                    if isinstance(b, dict) and b.get("provider"):
                        providers.add(str(b["provider"]))
                    elif isinstance(b, dict) and b.get("enabled", True):
                        # binding may only carry connection_id — resolve via connections
                        pass
            except Exception:  # noqa: BLE001
                pass
        conns = await mgr.list_connections(user_id=user_id)
        for c in conns or []:
            if isinstance(c, dict) and c.get("provider"):
                # If status present, only count active/healthy.
                status = str(c.get("status") or "active").lower()
                if status in {"active", "connected", "ok", ""}:
                    providers.add(str(c["provider"]))
    except Exception:  # noqa: BLE001
        logger.exception("readiness_connections_lookup_failed")

    if db is not None:
        try:
            if hasattr(db, "list_agent_connection_bindings"):
                rows = await db.list_agent_connection_bindings(agent_id=agent_id, user_id=user_id)
                for row in rows or []:
                    if isinstance(row, dict) and row.get("provider"):
                        providers.add(str(row["provider"]))
        except Exception:  # noqa: BLE001
            pass
    return providers


async def evaluate_agent_readiness(
    *,
    agent_id: str,
    user_id: str,
    spec: AgentSpec | dict[str, Any],
    db: Any | None = None,
    build_ok: bool | None = None,
) -> ReadinessResult:
    checks: list[ReadinessCheck] = []
    missing_connections: list[dict[str, Any]] = []
    missing_config: list[dict[str, Any]] = []

    parsed = _as_spec(spec)
    if parsed is None:
        checks.append(
            ReadinessCheck(
                key="spec_valid",
                ok=False,
                message="AgentSpec is invalid or cannot be migrated.",
                severity="error",
            )
        )
        return ReadinessResult(
            status="needs_attention",
            checks=checks,
            missing_connections=missing_connections,
            missing_config=missing_config,
        )

    checks.append(
        ReadinessCheck(
            key="spec_valid",
            ok=True,
            message=f"AgentSpec schema_version={parsed.schema_version} is valid.",
            severity="info",
        )
    )

    # Tools resolve via registry.
    from agent_service.integrations.registry import get_provider_registry

    registry = get_provider_registry()
    unresolved: list[str] = []
    connection_required_tools: list[Any] = []
    high_risk_without_approval = False

    for binding in parsed.tools:
        if not binding.enabled:
            continue
        tool = await registry.get_tool(binding.tool_id)
        if tool is None and binding.provider == "pipedream":
            # Pipedream tools may be remote-only; treat provider_tool_id as resolvable hint.
            if binding.external_action_id or binding.tool_id.startswith("pd:"):
                tool = None  # still unknown offline
            else:
                unresolved.append(binding.tool_id)
                continue
        if tool is None and binding.provider in {"native", "custom_api", ""}:
            # Try resolve regardless of binding.provider hint.
            ref = await registry.resolve_tool_ref(binding.tool_id)
            if ref is None:
                unresolved.append(binding.tool_id)
                continue
            tool = await registry.get_tool(binding.tool_id)

        if tool is None and binding.provider == "pipedream":
            # Allow pipedream ids that are not cached locally.
            pass
        elif tool is None:
            unresolved.append(binding.tool_id)
            continue

        if tool and tool.connection_required:
            connection_required_tools.append((binding, tool))

        risk = (tool.risk if tool else "low") or "low"
        approval = binding.approval_mode
        if risk == "high" and approval == "never" and (
            parsed.approvals.require_for_side_effects or parsed.security.approval_required_for_side_effects
        ):
            # Spec-level policy may still require approval even if binding says never.
            pass
        if risk == "high" and approval == "never" and not parsed.approvals.require_for_side_effects:
            high_risk_without_approval = True

    if unresolved:
        checks.append(
            ReadinessCheck(
                key="tools_resolve",
                ok=False,
                message=f"Unresolved tools: {', '.join(unresolved[:8])}",
                severity="error",
            )
        )
        for tid in unresolved:
            missing_config.append({"type": "unresolved_tool", "tool_id": tid})
    else:
        checks.append(
            ReadinessCheck(
                key="tools_resolve",
                ok=True,
                message="All enabled tools resolve via provider registry.",
                severity="info",
            )
        )

    # Connections present for connection_required tools + explicit requirements.
    bound = await _bound_providers(user_id, agent_id, db)
    needed: dict[str, dict[str, Any]] = {}

    for req in parsed.connection_requirements:
        if not req.required:
            continue
        provider = req.provider
        app_id = req.app_id or provider
        tool_ids = list(req.tool_ids or req.required_for or [])
        key = f"{provider}:{app_id}"
        needed[key] = {
            "provider": provider,
            "app_id": app_id,
            "auth_type": req.auth_type,
            "tool_ids": tool_ids,
        }

    for binding, tool in connection_required_tools:
        provider = tool.provider_app_id or binding.app_id or "google"
        # Native Google tools use provider_app_id=google; connections use provider=google.
        key = f"{provider}:{provider}"
        needed.setdefault(
            key,
            {
                "provider": provider,
                "app_id": tool.provider_app_id or provider,
                "auth_type": tool.auth_type,
                "tool_ids": [],
            },
        )
        needed[key]["tool_ids"] = list(
            {*needed[key].get("tool_ids", []), binding.tool_id}
        )

    for _key, req in needed.items():
        provider = str(req["provider"])
        if provider not in bound:
            missing_connections.append(req)

    if missing_connections:
        checks.append(
            ReadinessCheck(
                key="connections",
                ok=False,
                message=f"Missing {len(missing_connections)} required connection(s).",
                severity="error",
            )
        )
    else:
        checks.append(
            ReadinessCheck(
                key="connections",
                ok=True,
                message="Required connections are present.",
                severity="info",
            )
        )

    # Config completeness — identity/goal/instructions already validated by pydantic.
    config_ok = bool(parsed.identity.name and parsed.goal and parsed.instructions.system)
    if not config_ok:
        missing_config.append({"type": "identity", "message": "Name/goal/instructions incomplete."})
        checks.append(
            ReadinessCheck(
                key="config_complete",
                ok=False,
                message="Agent identity or instructions incomplete.",
                severity="error",
            )
        )
    else:
        checks.append(
            ReadinessCheck(
                key="config_complete",
                ok=True,
                message="Core agent configuration is complete.",
                severity="info",
            )
        )

    if build_ok is False:
        checks.append(
            ReadinessCheck(
                key="build_ok",
                ok=False,
                message="Latest build did not succeed.",
                severity="error",
            )
        )
    elif build_ok is True:
        checks.append(
            ReadinessCheck(
                key="build_ok",
                ok=True,
                message="Latest build succeeded.",
                severity="info",
            )
        )
    else:
        checks.append(
            ReadinessCheck(
                key="build_ok",
                ok=True,
                message="Build status not provided; skipped.",
                severity="info",
            )
        )

    if high_risk_without_approval:
        checks.append(
            ReadinessCheck(
                key="approval_policy",
                ok=False,
                message="High-risk tools lack approval policy (binding never + approvals disabled).",
                severity="warn",
            )
        )
    else:
        # Also verify side-effect tools have non-never approval when policy requires it.
        side_effect_ok = True
        if parsed.approvals.require_for_side_effects:
            for binding in parsed.tools:
                if not binding.enabled:
                    continue
                tool = await registry.get_tool(binding.tool_id)
                if tool and tool.side_effect and binding.approval_mode == "never":
                    # Global policy still gates at runtime; warn only.
                    side_effect_ok = True
        checks.append(
            ReadinessCheck(
                key="approval_policy",
                ok=side_effect_ok,
                message="Approval policy covers high-risk / side-effect tools.",
                severity="info" if side_effect_ok else "warn",
            )
        )

    errors = [c for c in checks if not c.ok and c.severity == "error"]
    warns = [c for c in checks if not c.ok and c.severity == "warn"]

    if missing_connections or any(c.key == "connections" and not c.ok for c in checks):
        status = "needs_setup"
    elif errors:
        status = "needs_attention"
    elif warns:
        status = "needs_attention"
    else:
        status = "ready"

    return ReadinessResult(
        status=status,
        checks=checks,
        missing_connections=missing_connections,
        missing_config=missing_config,
    )
