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
    user_id: str,
    agent_id: str,
    *,
    installation_id: str | None = None,
) -> tuple[set[str], set[str], dict[str, set[str]]]:
    """Return (providers, app_ids, tool_id -> providers) from installation/agent bindings.

    Also includes active user-level connection apps (Google / Pipedream) so Setup
    needed clears once the account exists — runtime will auto-bind on first use.
    """
    providers: set[str] = set()
    app_ids: set[str] = set()
    tool_coverage: dict[str, set[str]] = {}
    try:
        from agent_service.connections.manager import ConnectionManager

        mgr = ConnectionManager()
        bindings = await mgr.list_bindings(
            user_id=user_id, agent_id=agent_id, installation_id=installation_id
        )
        connections = await mgr.list_connections(user_id=user_id)
        by_id = {str(c.get("id")): c for c in connections or []}

        def _ingest_conn(conn: dict[str, Any]) -> None:
            status = str(conn.get("status") or "active").lower()
            if status not in {"active", "connected", "ok"}:
                return
            provider = str(conn.get("provider") or "")
            if not provider:
                return
            providers.add(provider)
            meta = conn.get("provider_metadata") or {}
            if provider == "google":
                app_ids.add("google")
                return
            app = None
            if isinstance(meta, dict):
                app = meta.get("app_id")
            if app:
                app_ids.add(str(app))
            extra_apps = meta.get("app_ids") if isinstance(meta, dict) else None
            if isinstance(extra_apps, list):
                for item in extra_apps:
                    if item:
                        app_ids.add(str(item))

        for binding in bindings or []:
            if not isinstance(binding, dict) or not binding.get("enabled", True):
                continue
            conn = by_id.get(str(binding.get("connection_id")))
            if not conn:
                continue
            _ingest_conn(conn)
            provider = str(conn.get("provider") or "")
            for tid in binding.get("tool_ids") or []:
                tool_coverage.setdefault(str(tid), set()).add(provider)

        # Owner convenience: active accounts on the user also satisfy readiness.
        for conn in connections or []:
            if isinstance(conn, dict):
                _ingest_conn(conn)
    except Exception:  # noqa: BLE001
        logger.exception("readiness_bindings_lookup_failed")
    return providers, app_ids, tool_coverage


async def evaluate_definition_readiness(
    *,
    agent_id: str,
    user_id: str,
    spec: AgentSpec | dict[str, Any],
    db: Any | None = None,
    build_ok: bool | None = None,
    verification_passed: bool | None = None,
) -> ReadinessResult:
    """Portable template readiness — never requires user OAuth / LLM secrets."""
    return await evaluate_agent_readiness(
        agent_id=agent_id,
        user_id=user_id,
        spec=spec,
        db=db,
        build_ok=build_ok,
        require_brain=False,
        llm_status=None,
        verification_passed=verification_passed,
        include_installation_checks=False,
    )


async def evaluate_installation_readiness(
    *,
    agent_id: str,
    user_id: str,
    spec: AgentSpec | dict[str, Any],
    db: Any | None = None,
    installation_id: str | None = None,
    build_ok: bool | None = None,
    llm_status: str | None = None,
    verification_passed: bool | None = None,
) -> ReadinessResult:
    """Runtime installation readiness — LLM, connections, tool config, memory."""
    return await evaluate_agent_readiness(
        agent_id=agent_id,
        user_id=user_id,
        spec=spec,
        db=db,
        build_ok=build_ok,
        require_brain=True,
        llm_status=llm_status,
        verification_passed=verification_passed,
        include_installation_checks=True,
        installation_id=installation_id,
    )


async def evaluate_agent_readiness(
    *,
    agent_id: str,
    user_id: str,
    spec: AgentSpec | dict[str, Any],
    db: Any | None = None,
    build_ok: bool | None = None,
    require_brain: bool = False,
    llm_status: str | None = None,
    verification_passed: bool | None = None,
    include_installation_checks: bool = True,
    installation_id: str | None = None,
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

    if include_installation_checks:
        bound_providers, bound_apps, tool_coverage = await _agent_bound_coverage(
            user_id, agent_id, installation_id=installation_id
        )
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
            app_id = getattr(tool, "provider_app_id", None) or binding.app_id or provider
            if provider == "native":
                from agent_service.integrations.app_keys import (
                    app_key_from_tool_id,
                    oauth_provider_for_app,
                )

                app_id = app_key_from_tool_id(binding.tool_id, app_id=app_id)
                provider = oauth_provider_for_app(app_id)
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
                # Per-app only — a Notion/Canva Pipedream account must never
                # cover Google Calendar (or any other app).
                covered = bool(app_id and app_id in bound_apps)
            else:
                if tool_ids:
                    covered = all(
                        provider in tool_coverage.get(tid, set()) or tid in tool_coverage
                        for tid in tool_ids
                    )
                    if not covered and provider in bound_providers:
                        covered = True
                else:
                    covered = app_id in bound_apps or provider in bound_providers
                # Pipedream per-app accounts cover former native Google product apps
                # (Calendar / Gmail / Docs) so users never need Stack32's Google OAuth app.
                if (
                    not covered
                    and provider == "google"
                    and app_id
                    and app_id in bound_apps
                ):
                    covered = True
            if not covered:
                missing_connections.append(req)

        try:
            from agent_service.integrations.pipedream.accounts import load_agent_tool_config
            from agent_service.integrations.pipedream.knowledge import hint_for_app
            from agent_service.integrations.pipedream.tool_config import (
                is_static_prop_configured,
                merge_binding_and_stored_config,
                resolve_effective_tool_config,
            )

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
                declared = set((static_schema.get("properties") or {}).keys())
                app_id = schema_payload.get("provider_app_id") or getattr(binding, "app_id", None)
                hint = hint_for_app(app_id) if app_id else None
                if hint and isinstance(hint.get("required_props"), list):
                    for key in hint["required_props"]:
                        key = key.strip() if isinstance(key, str) else ""
                        # A hint is per app, but it was being applied to every
                        # action of that app. Trello's hint names checklistItemId,
                        # so trello-search-boards — which has no such field —
                        # counted as missing a setting the user could never fill,
                        # and the agent could never become ready. Only settings
                        # this action actually declares can be missing from it.
                        if key and key in declared and key not in required_static:
                            required_static.append(key)
                if not required_static:
                    continue
                stored = await load_agent_tool_config(
                    user_id=user_id,
                    agent_id=agent_id,
                    tool_id=binding.tool_id,
                    installation_id=installation_id,
                )
                binding_cfg = binding.config if isinstance(binding.config, dict) else {}
                merged = await resolve_effective_tool_config(
                    user_id=user_id,
                    agent_id=agent_id,
                    tool_id=binding.tool_id,
                    binding_config=binding_cfg,
                    installation_id=installation_id,
                    app_id=app_id,
                )
                if not merged:
                    merged = merge_binding_and_stored_config(
                        binding_config=binding_cfg,
                        stored_config=stored,
                    )
                app_id = schema_payload.get("provider_app_id") or getattr(binding, "app_id", None)
                missing_keys = [
                    k
                    for k in required_static
                    if not is_static_prop_configured(k, merged, app_id=app_id)
                ]
                if missing_keys:
                    missing_config.append(
                        {
                            "type": "tool_config",
                            "tool_id": binding.tool_id,
                            "fields": missing_keys,
                        }
                    )
        except Exception:  # noqa: BLE001
            # This block gates publication. Skipping it silently lets an agent
            # with unconfigured Pipedream tools pass the readiness check and be
            # published broken, so surface it rather than hide it at debug level.
            logger.exception("readiness_tool_config_check_failed agent_id=%s", agent_id)

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

        # The event trigger has required settings of its own, and nothing was
        # checking them. An agent whose Trello trigger had no board chosen was
        # told to configure eight Airtable actions and never told the one thing
        # that actually stopped it from listening.
        try:
            from agent_service.triggers.service import (
                _missing_required_static,
                configured_tool_trigger,
            )

            trigger_row = await configured_tool_trigger(user_id=user_id, agent_id=agent_id)
            component_id = str((trigger_row or {}).get("component_id") or "").strip()
            if component_id:
                cfg = trigger_row.get("config") if isinstance(trigger_row.get("config"), dict) else {}
                from agent_service.integrations.pipedream.client import PipedreamClient

                trigger_missing = await _missing_required_static(
                    component_id=component_id,
                    extra_props=cfg.get("extra_props"),
                    client=PipedreamClient(),
                )
                if trigger_missing:
                    missing_config.append(
                        {
                            "type": "trigger_config",
                            "tool_id": f"pd:{component_id}",
                            "fields": trigger_missing,
                        }
                    )
        except Exception:  # noqa: BLE001
            # A trigger we cannot inspect must not silently pass as ready, but
            # it must not take the whole readiness check down either.
            logger.exception("readiness_trigger_config_check_failed agent_id=%s", agent_id)

        if any(m.get("type") in {"tool_config", "trigger_config"} for m in missing_config):
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
    else:
        # Definition readiness: requirements are declared, not satisfied.
        req_count = len([r for r in parsed.connection_requirements if r.required])
        checks.append(
            ReadinessCheck(
                key="connection_requirements",
                ok=True,
                message=(
                    f"{req_count} portable connection requirement(s) declared."
                    if req_count
                    else "No external account requirements."
                ),
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

    # Brain: model selection + Pipedream Connect LLM (or legacy BYOK secret).
    brain_severity = "error" if (require_brain and include_installation_checks) else "info"
    model_cfg = parsed.model
    if include_installation_checks:
        if model_cfg is None or not (model_cfg.provider and model_cfg.model_id):
            brain_ok = False
            brain_msg = "Choose a provider and model, then connect it with Pipedream."
        elif llm_status is not None and llm_status != "valid":
            brain_ok = False
            brain_msg = "Reconnect your LLM provider via Pipedream — the last check did not pass."
        elif llm_status == "valid":
            brain_ok = True
            brain_msg = "Agent brain (model + Pipedream connection) is configured."
        else:
            from agent_service.security.user_secrets import has_llm_secret

            brain_ok = await has_llm_secret(
                user_id=user_id,
                agent_id=agent_id,
                installation_id=installation_id,
                preferred_provider=str(model_cfg.provider) if model_cfg.provider else None,
            )
            brain_msg = (
                "Agent brain (model + Pipedream connection) is configured."
                if brain_ok
                else "Connect your LLM provider with Pipedream (OpenAI, Anthropic, …)."
            )
    else:
        brain_ok = True
        brain_msg = (
            f"Recommended model: {model_cfg.provider}/{model_cfg.model_id}."
            if model_cfg and model_cfg.provider and model_cfg.model_id
            else "Model credential is configured at installation time via Pipedream."
        )
    checks.append(
        ReadinessCheck(
            key="brain",
            ok=brain_ok,
            message=brain_msg,
            severity="info" if brain_ok else brain_severity,
        )
    )
    if not brain_ok and require_brain and include_installation_checks:
        missing_config.append({"type": "brain", "message": brain_msg})

    # External memory via Pipedream — require a connected account for the chosen app.
    memory_cfg = parsed.memory
    if (
        include_installation_checks
        and memory_cfg.provider == "external_postgres"
        and memory_cfg.external_app_id
    ):
        mem_app = str(memory_cfg.external_app_id).strip().lower()
        mem_aliases = {mem_app, mem_app.replace("_", "-"), mem_app.replace("-", "_")}
        _, bound_apps, _ = await _agent_bound_coverage(
            user_id, agent_id, installation_id=installation_id
        )
        mem_ok = any(a.lower() in mem_aliases for a in bound_apps)
        mem_msg = (
            f"External memory database ({memory_cfg.external_app_id}) is connected."
            if mem_ok
            else (
                f"Connect {memory_cfg.external_app_id} via Pipedream for external memory."
            )
        )
        checks.append(
            ReadinessCheck(
                key="memory",
                ok=mem_ok,
                message=mem_msg,
                severity="info" if mem_ok else "warn",
            )
        )
        if not mem_ok:
            missing_config.append(
                {
                    "type": "memory",
                    "app_id": memory_cfg.external_app_id,
                    "message": mem_msg,
                }
            )
    else:
        checks.append(
            ReadinessCheck(
                key="memory",
                ok=True,
                message=(
                    "Stack32 built-in memory is active."
                    if memory_cfg.provider != "external_postgres"
                    else "Choose a Pipedream database app for external memory."
                ),
                severity="info",
            )
        )

    # Trigger — Chat is the built-in entrypoint from agent creation (Structure UI and
    # normalize_triggers default to Chat when the list is empty). Schedule is optional.
    # Never a setup gate: Live Chat works without an explicit trigger row.
    active_triggers = [
        t for t in parsed.triggers if t.enabled and t.kind in ("chat", "schedule")
    ]
    trigger_ok = True
    checks.append(
        ReadinessCheck(
            key="trigger",
            ok=trigger_ok,
            message=(
                "At least one Chat or Schedule trigger is enabled."
                if active_triggers
                else "Chat is available by default."
            ),
            severity="info",
        )
    )

    # Verification P0 — the last verify→repair pipeline must have passed for the
    # current version. Enforced hard only for the publish gate (require_brain).
    if verification_passed is not None:
        verification_ok = bool(verification_passed)
        checks.append(
            ReadinessCheck(
                key="verification",
                ok=verification_ok,
                message=(
                    "Verification passed for the current version."
                    if verification_ok
                    else "Run verification again — the last pipeline did not pass."
                ),
                severity="info"
                if verification_ok
                else ("error" if require_brain else "warn"),
            )
        )
        if not verification_ok and require_brain:
            missing_config.append(
                {"type": "verification", "message": "Verification has not passed."}
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

    # Setup-type gaps (user picks a model / connects an app) are needs_setup,
    # distinct from a broken build/tools which is needs_attention.
    # Trigger is never a setup gate — Chat ships enabled by default.
    setup_errors = {"brain", "connections", "tool_config"}
    setup_error_present = any(
        not c.ok and c.severity == "error" and c.key in setup_errors for c in checks
    )
    hard_errors = [
        c for c in checks if not c.ok and c.severity == "error" and c.key not in setup_errors
    ]

    # Unresolved tools / hard errors outrank missing connections (needs_attention).
    unresolved_present = any(m.get("type") == "unresolved_tool" for m in missing_config)
    tools_check_failed = any(c.key == "tools_resolve" and not c.ok for c in checks)
    if unresolved_present or tools_check_failed or hard_errors:
        status = "needs_attention"
    elif (
        missing_connections
        or any(m.get("type") == "tool_config" for m in missing_config)
        or setup_error_present
    ):
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
