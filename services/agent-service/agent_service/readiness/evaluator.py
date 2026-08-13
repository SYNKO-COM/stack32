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


async def _agent_bound_coverage(
    user_id: str, agent_id: str
) -> tuple[set[str], set[str], dict[str, set[str]]]:
    """Return (providers, app_ids, tool_id -> providers) from *this agent*'s bindings only."""
    providers: set[str] = set()
    app_ids: set[str] = set()
    tool_coverage: dict[str, set[str]] = {}
    try:
        from agent_service.connections.manager import ConnectionManager

        mgr = ConnectionManager()
        bindings = await mgr.list_bindings(user_id=user_id, agent_id=agent_id)
        connections = await mgr.list_connections(user_id=user_id)
        by_id = {str(c.get("id")): c for c in connections or []}
        for binding in bindings or []:
            if not isinstance(binding, dict) or not binding.get("enabled", True):
                continue
            conn = by_id.get(str(binding.get("connection_id")))
            if not conn:
                continue
            status = str(conn.get("status") or "active").lower()
            if status not in {"active", "connected", "ok"}:
                continue
            provider = str(conn.get("provider") or "")
            if not provider:
                continue
            providers.add(provider)
            meta = conn.get("provider_metadata") or {}
            app = None
            if isinstance(meta, dict):
                app = meta.get("app_id")
            if app:
                app_ids.add(str(app))
            if provider == "google":
                app_ids.add("google")
            for tid in binding.get("tool_ids") or []:
                tool_coverage.setdefault(str(tid), set()).add(provider)
    except Exception:  # noqa: BLE001
        logger.exception("readiness_bindings_lookup_failed")
    return providers, app_ids, tool_coverage


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
                message="The agent configuration is invalid.",
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
            message="Agent configuration is valid.",
            severity="info",
        )
    )

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
            # Require remote schema resolution for Pipedream — soft cache miss is not OK for ready.
            try:
                schema = await registry.get_provider("pipedream").get_tool_schema(binding.tool_id)  # type: ignore[union-attr]
            except Exception:  # noqa: BLE001
                schema = None
            if not schema:
                unresolved.append(binding.tool_id)
                continue
            # Synthetic tool marker for connection_required
            connection_required_tools.append((binding, type("T", (), {
                "connection_required": True,
                "provider": "pipedream",
                "provider_app_id": binding.app_id,
                "auth_type": "oauth2",
                "risk": "medium",
                "side_effect": True,
            })()))
            continue
        if tool is None:
            ref = await registry.resolve_tool_ref(binding.tool_id)
            if ref is None:
                unresolved.append(binding.tool_id)
                continue
            tool = await registry.get_tool(binding.tool_id)

        if tool is None:
            unresolved.append(binding.tool_id)
            continue

        if tool.connection_required:
            connection_required_tools.append((binding, tool))

        risk = (tool.risk if tool else "low") or "low"
        approval = binding.approval_mode
        if risk == "high" and approval == "never" and not parsed.approvals.require_for_side_effects:
            high_risk_without_approval = True

    if unresolved:
        checks.append(
            ReadinessCheck(
                key="tools_resolve",
                ok=False,
                message=f"Some tools still need to be set up: {', '.join(unresolved[:8])}",
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

    bound_providers, bound_apps, tool_coverage = await _agent_bound_coverage(user_id, agent_id)
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
        provider = getattr(tool, "provider", None) or binding.provider or "native"
        if provider == "native":
            provider = "google"
        app_id = getattr(tool, "provider_app_id", None) or binding.app_id or provider
        key = f"{provider}:{app_id}"
        needed.setdefault(
            key,
            {
                "provider": provider,
                "app_id": app_id,
                "auth_type": getattr(tool, "auth_type", "oauth2"),
                "tool_ids": [],
            },
        )
        needed[key]["tool_ids"] = list({*needed[key].get("tool_ids", []), binding.tool_id})

    for _key, req in needed.items():
        provider = str(req["provider"])
        app_id = str(req.get("app_id") or provider)
        tool_ids = list(req.get("tool_ids") or [])
        covered = False
        if provider == "pipedream":
            # Need a binding whose connection app matches and tool_ids cover requirement.
            if app_id in bound_apps or provider in bound_providers:
                if not tool_ids:
                    covered = provider in bound_providers and (
                        not app_id or app_id in bound_apps or app_id == provider
                    )
                else:
                    covered = all(
                        provider in tool_coverage.get(tid, set())
                        or "pipedream" in tool_coverage.get(tid, set())
                        for tid in tool_ids
                    )
        else:
            # Google / native: provider must be bound on *this* agent for the tools.
            if tool_ids:
                covered = all(provider in tool_coverage.get(tid, set()) for tid in tool_ids)
                if not covered and provider in bound_providers:
                    # Binding may list a subset — require at least one overlapping tool_id
                    covered = any(provider in tool_coverage.get(tid, set()) for tid in tool_ids)
                    if not covered:
                        # Some agents bind google with a tool list that includes these ids
                        covered = provider in bound_providers and any(
                            tid in tool_coverage for tid in tool_ids
                        )
            else:
                covered = provider in bound_providers
        if not covered:
            missing_connections.append(req)

    # Static tool configuration for Pipedream (required static props)
    try:
        from agent_service.integrations.pipedream.accounts import load_agent_tool_config

        pd = registry.get_provider("pipedream")
        for binding in parsed.tools:
            if not binding.enabled or binding.provider not in {"pipedream", ""}:
                continue
            if not str(binding.tool_id).startswith("pd:") and binding.provider != "pipedream":
                continue
            if pd is None:
                continue
            schema_payload = await pd.get_tool_schema(binding.tool_id)
            if not schema_payload:
                continue
            static_schema = schema_payload.get("static_schema") or {}
            required_static = list(static_schema.get("required") or [])
            if not required_static:
                continue
            stored = await load_agent_tool_config(
                user_id=user_id, agent_id=agent_id, tool_id=binding.tool_id
            )
            binding_cfg = binding.config if isinstance(binding.config, dict) else {}
            merged = {**binding_cfg, **stored}
            missing_keys = [k for k in required_static if k not in merged or merged[k] in (None, "")]
            if missing_keys:
                missing_config.append(
                    {
                        "type": "tool_config",
                        "tool_id": binding.tool_id,
                        "fields": missing_keys,
                    }
                )
    except Exception:  # noqa: BLE001
        logger.debug("readiness_tool_config_check_failed", exc_info=True)

    if missing_connections:
        checks.append(
            ReadinessCheck(
                key="connections",
                ok=False,
                message=(
                    f"Connect {len(missing_connections)} account(s) so this agent can use its tools."
                    if len(missing_connections) != 1
                    else "Connect one account so this agent can use its tools."
                ),
                severity="error",
            )
        )
    else:
        checks.append(
            ReadinessCheck(
                key="connections",
                ok=True,
                message="Required accounts are connected for this agent.",
                severity="info",
            )
        )

    if any(m.get("type") == "tool_config" for m in missing_config):
        checks.append(
            ReadinessCheck(
                key="tool_config",
                ok=False,
                message="One or more tools still need a setting (channel, calendar, …).",
                severity="error",
            )
        )
    else:
        checks.append(
            ReadinessCheck(
                key="tool_config",
                ok=True,
                message="Tool settings look complete.",
                severity="info",
            )
        )

    config_ok = bool(parsed.identity.name and parsed.goal and parsed.instructions.system)
    if not config_ok:
        missing_config.append({"type": "identity", "message": "Name/goal/instructions incomplete."})
        checks.append(
            ReadinessCheck(
                key="config_complete",
                ok=False,
                message="Agent setup is incomplete (name or instructions).",
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
                message="Some tools can make changes without asking you first — review approvals.",
                severity="warn",
            )
        )
    else:
        checks.append(
            ReadinessCheck(
                key="approval_policy",
                ok=True,
                message="Approval policy covers high-risk / side-effect tools.",
                severity="info",
            )
        )

    errors = [c for c in checks if not c.ok and c.severity == "error"]
    warns = [c for c in checks if not c.ok and c.severity == "warn"]

    # Unresolved tools / hard errors outrank missing connections (needs_attention).
    unresolved_present = any(m.get("type") == "unresolved_tool" for m in missing_config)
    tools_check_failed = any(c.key == "tools_resolve" and not c.ok for c in checks)
    if unresolved_present or tools_check_failed or (errors and not missing_connections):
        status = "needs_attention"
    elif missing_connections or any(m.get("type") == "tool_config" for m in missing_config):
        status = "needs_setup"
    elif errors or warns:
        status = "needs_attention"
    else:
        status = "ready"

    return ReadinessResult(
        status=status,
        checks=checks,
        missing_connections=missing_connections,
        missing_config=missing_config,
    )
