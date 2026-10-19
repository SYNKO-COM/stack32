"""Onboarding prepares real specs, fails honestly, and never executes tools."""
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest

from agent_service.builder.onboarding import apply_control, onboarding_live_allowed, prepare_onboarding_run
from agent_service.models.agent_spec import AgentIdentity, AgentInstructions, AgentSpec, ToolBinding
from agent_service.models.graph_spec import default_linear_graph
from agent_service.supabase_client import Persistence


@pytest.fixture(autouse=True)
def isolated_preparation_budget(monkeypatch):
    @asynccontextmanager
    async def budget(**kwargs):
        yield
    monkeypatch.setattr("agent_service.builder.onboarding.llm_run_budget", budget)


def spec():
    return AgentSpec(identity=AgentIdentity(name="Invoice helper", role="Summarize invoices"),
                     goal="Summarize invoices", instructions=AgentInstructions(system="Summarize supplied invoices."),
                     tools=[ToolBinding(tool_id="gmail_send", provider="native")],
                     graph=default_linear_graph(["gmail_send"]))


def test_control_is_enforced_in_bindings():
    assert apply_control(spec(), "Avant chaque envoi").tools[0].approval_mode == "always"
    assert apply_control(spec(), "Sur les cas sensibles").tools[0].approval_mode == "always"
    after_test = apply_control(spec(), "Après test et ajustement")
    assert after_test.tools[0].approval_mode == "conditional"
    assert after_test.tools[0].config["review_until_tested"] is True


async def test_real_builder_spec_is_persisted_not_a_timer(monkeypatch):
    project = {"id": "project", "lease_token": "token", "brief": "Summarize invoices", "user_id": "owner", "agent_id": "agent", "control": "Avant chaque envoi"}
    rpc = AsyncMock(side_effect=[project, True])
    generator = AsyncMock(return_value=(spec(), []))
    monkeypatch.setattr("agent_service.builder.onboarding.rpc", rpc)
    monkeypatch.setattr("agent_service.builder.orchestrator.BuilderOrchestrator._generate_spec", generator)
    result = await prepare_onboarding_run(Persistence(), "run")
    assert result["status"] == "completed"
    saved = rpc.call_args.args[1]["p_spec"]
    assert saved["goal"] == "Summarize invoices"
    assert saved["tools"][0]["approval_mode"] == "always"
    assert saved["graph"]["nodes"]


async def test_failed_preparation_retains_retryable_failure(monkeypatch):
    rpc = AsyncMock(side_effect=[{"id": "project", "lease_token": "token", "brief": "Summarize invoices", "user_id": "owner", "agent_id": "agent"}, True])
    monkeypatch.setattr("agent_service.builder.onboarding.rpc", rpc)
    monkeypatch.setattr("agent_service.builder.orchestrator.BuilderOrchestrator._generate_spec", AsyncMock(side_effect=RuntimeError("provider unavailable")))
    result = await prepare_onboarding_run(Persistence(), "run")
    assert result["error"] == "ONBOARDING_PREPARATION_FAILED"
    assert "p_spec" not in rpc.call_args.args[1]
    assert rpc.call_args.args[1]["p_error"] == "ONBOARDING_PREPARATION_FAILED"


async def test_duplicate_delivery_never_invokes_the_builder(monkeypatch):
    monkeypatch.setattr("agent_service.builder.onboarding.rpc", AsyncMock(return_value=None))
    generator = AsyncMock()
    monkeypatch.setattr("agent_service.builder.orchestrator.BuilderOrchestrator._generate_spec", generator)
    assert (await prepare_onboarding_run(Persistence(), "run"))["status"] == "already_claimed"
    generator.assert_not_called()


@pytest.mark.parametrize("status,subscriptions,allowed", [
    ("ready", [], False), ("preparing", [], False), ("launched", [], False),
    ("launched", [{"current_period_end": "2000-01-01T00:00:00Z"}], False),
    ("launched", [{"current_period_end": "2099-01-01T00:00:00Z"}], True),
])
async def test_new_agent_access_checked_on_every_run(status, subscriptions, allowed):
    db = AsyncMock()
    db._select.side_effect = [[{"status": status, "user_id": "owner"}], subscriptions]
    assert await onboarding_live_allowed(db, user_id="owner", agent_id="agent") is allowed


async def test_historical_desktop_agent_access_is_unchanged():
    db = AsyncMock()
    db._select.return_value = []
    assert await onboarding_live_allowed(db, user_id="owner", agent_id="old-agent")


async def test_enabled_binding_cannot_bypass_explicit_review(monkeypatch):
    monkeypatch.setenv("AI_EXECUTION_MODE", "mock")
    monkeypatch.setenv("AGENT_RUNTIME_VERSION", "langgraph")
    from agent_service.config import get_settings
    from agent_service.runtime.langgraph_runtime import run_langgraph_agent
    get_settings.cache_clear()
    agent = spec()
    agent.tools = [ToolBinding(tool_id="calculator", enabled=True, approval_mode="always")]
    agent.graph = default_linear_graph(["calculator"])
    execute = AsyncMock()
    monkeypatch.setattr("agent_service.runtime.langgraph_runtime.execute_tool", execute)
    monkeypatch.setattr("agent_service.runtime.approvals.approved_tool_ids_for_run", AsyncMock(return_value=["calculator"]))
    monkeypatch.setattr("agent_service.runtime.approvals.denied_tool_ids_for_run", AsyncMock(return_value=[]))
    monkeypatch.setattr("agent_service.runtime.approvals.approved_call", AsyncMock(return_value=False))
    monkeypatch.setattr("agent_service.runtime.approvals.create_approval_request", AsyncMock(return_value={"id": "review"}))
    db = AsyncMock()
    db._select.return_value = []
    result = await run_langgraph_agent(db=db, run_id="review-run", user_id="owner", agent_id="agent",
                                      thread_id="review-thread", content="Compute 7+5", spec=agent,
                                      user_creds=("openai", "sk-test-key-not-real"))
    assert result["status"] == "interrupted"
    execute.assert_not_called()
    get_settings.cache_clear()


async def test_onboarding_launch_waits_for_model_setup_without_losing_its_run(monkeypatch):
    from agent_service.config import get_settings
    from agent_service.runtime.live import LiveRuntime
    monkeypatch.setenv("LIVE_REQUIRE_USER_LLM_KEY", "false")
    get_settings.cache_clear()
    db = AsyncMock()
    runtime = LiveRuntime(db)
    runtime._run_was_canceled = AsyncMock(return_value=False)
    runtime._finalize_progress = AsyncMock()
    result = await runtime._execute_live_run_inner(
        run_id="original-launch", user_id="owner", agent_id="agent", thread_id="thread",
        content="Original resolved brief", spec=spec(), user_creds=("openai", "test-only"),
        onboarding_launch=True,
    )
    assert result["error"] == "LLM_CONFIGURATION_REQUIRED"
    db.fail_run.assert_awaited_once_with("original-launch", "LLM_CONFIGURATION_REQUIRED")
    metadata = runtime._finalize_progress.call_args.kwargs["metadata"]
    assert any(field["key"] == "onboarding_run_id" and field["suggested_value"] == "original-launch"
               for field in metadata["ui_component"]["fields"])
    get_settings.cache_clear()


@pytest.mark.parametrize("lease,expected", [("2099-01-01T00:00:00Z", False), ("2000-01-01T00:00:00Z", True), (None, True)])
async def test_dispatch_recovers_only_expired_preparation_leases(monkeypatch, lease, expected):
    from types import SimpleNamespace

    from agent_service.routers.onboarding import dispatch_onboarding
    db = AsyncMock()
    db._select.return_value = [{"status": "preparing", "preparation_run_id": "run", "lease_until": lease}]
    db.get_owned_run.return_value = {"id": "run", "status": "running"}
    dispatch = AsyncMock(return_value={"status": "queued"})
    monkeypatch.setattr("agent_service.routers.onboarding.get_persistence", lambda: db)
    monkeypatch.setattr("agent_service.routers.onboarding._guards", AsyncMock())
    monkeypatch.setattr("agent_service.routers.onboarding.dispatch_run", dispatch)
    await dispatch_onboarding(SimpleNamespace(user_id="owner"))
    assert dispatch.await_count == int(expected)
