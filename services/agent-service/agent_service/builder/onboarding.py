"""Durable onboarding drafts, built by the existing declarative agent builder.

No generated agent or integration action executes during preparation.
"""
from __future__ import annotations

import asyncio
from typing import Any

from agent_service.builder.orchestrator import BuilderOrchestrator
from agent_service.compiler.graph_compiler import compile_graph
from agent_service.config import get_settings
from agent_service.gateway.router import TaskComplexity
from agent_service.models.agent_spec import AgentIdentity, AgentSpec
from agent_service.security.llm_budget import llm_run_budget
from agent_service.supabase_client import Persistence, get_supabase_admin_client
from agent_service.tools.runtime import SIDE_EFFECT_TOOLS


async def rpc(name: str, body: dict[str, Any]) -> Any:
    async with get_supabase_admin_client() as client:
        response = await client.post(f"/rpc/{name}", json=body)
        response.raise_for_status()
        return response.json()


def apply_control(spec: AgentSpec, control: str | None) -> AgentSpec:
    """An enabled tool is never consent for a binding explicitly requiring review."""
    every = control == "Avant chaque envoi"
    sensitive = control != "Après test et ajustement"
    for tool in spec.tools:
        # External actions are conservative until their actual catalog risk is known.
        external = tool.provider in {"pipedream", "custom_api"}
        side_effect = bool(tool.config.get("side_effect")) or external or tool.tool_id in SIDE_EFFECT_TOOLS
        if side_effect:
            tool.approval_mode = "always" if every or sensitive else "conditional"
            if not sensitive:
                tool.config["review_until_tested"] = True
    spec.approvals.require_for_side_effects = sensitive
    spec.approvals.require_for_email_send = sensitive
    spec.instructions.behavioral_rules = [
        rule for rule in spec.instructions.behavioral_rules
        if "including send" not in rule.lower()
    ]
    spec.instructions.behavioral_rules.append(
        f"User review preference: {control or 'Sur les cas sensibles'}. "
        "Use only connected tools. Request missing input before acting. "
        "Never treat an objective as permission to send, publish or pay."
    )
    return AgentSpec.model_validate(spec.model_dump())


async def prepare_onboarding_run(db: Persistence, run_id: str) -> dict[str, Any]:
    project = await rpc("claim_onboarding_preparation", {"p_run_id": run_id})
    if not project or not project.get("id"):
        return {"status": "already_claimed", "run_id": run_id}
    token = project["lease_token"]
    try:
        orch = BuilderOrchestrator(db)
        # The historical interactive builder has a fallback design. This journey
        # must surface provider errors, rather than announce success on a timer.
        orch.require_blueprint = True
        brief = str(project["brief"])
        async with asyncio.timeout(240), llm_run_budget(
            run_id=run_id, user_id=str(project["user_id"]), agent_id=str(project["agent_id"]),
            max_calls=get_settings().MAX_LLM_CALLS_PER_RUN, source="builder",
        ):
            spec, _ = await orch._generate_spec(
                brief, AgentIdentity(name="Mon agent IA", role=brief.splitlines()[0][:240]),
                TaskComplexity.STANDARD, None,
                {"original_goal": brief, "context_notes": "Prepare a draft only; no external action."},
                user_id=str(project["user_id"]), agent_id=str(project["agent_id"]),
            )
        spec = apply_control(spec, project.get("control"))
        if not spec.graph.nodes:
            raise ValueError("empty_graph")
        compile_graph(spec)  # Validate the executable graph without running it.
        saved = await rpc("finish_onboarding_preparation", {
            "p_run_id": run_id, "p_token": token, "p_spec": spec.model_dump(mode="json"),
        })
        return {"status": "completed" if saved else "superseded", "run_id": run_id}
    except Exception:  # noqa: BLE001 - persist a safe error; answers remain retryable
        await rpc("finish_onboarding_preparation", {
            "p_run_id": run_id, "p_token": token, "p_error": "ONBOARDING_PREPARATION_FAILED",
        })
        return {"error": "ONBOARDING_PREPARATION_FAILED", "run_id": run_id}


async def onboarding_live_allowed(db: Persistence, *, user_id: str, agent_id: str) -> bool:
    projects = await db._select("onboarding_projects", {
        "agent_id": f"eq.{agent_id}", "select": "status,user_id", "limit": "1",
    })
    if not projects:
        return True  # Historical desktop agents keep their existing access rules.
    if projects[0]["user_id"] != user_id:
        return True  # Published-agent consumers still follow installation access checks.
    if projects[0]["status"] != "launched":
        return False
    subscriptions = await db._select("subscriptions", {
        "user_id": f"eq.{user_id}", "status": "in.(active,trialing)",
        "plan_key": "in.(starter,pro,scale)", "select": "current_period_end", "limit": "1",
    })
    if not subscriptions:
        return False
    end = subscriptions[0].get("current_period_end")
    if end:
        from datetime import UTC, datetime
        return datetime.fromisoformat(str(end).replace("Z", "+00:00")) > datetime.now(UTC)
    return True
