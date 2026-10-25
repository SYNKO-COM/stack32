"""A provider plan denial cannot silently remove the user's requested app."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

from agent_service.builder.orchestrator import BuilderOrchestrator
from agent_service.gateway.router import TaskComplexity
from agent_service.integrations.pipedream.client import PipedreamClient, PipedreamError
from agent_service.integrations.registry import ProviderRegistry
from agent_service.models.agent_spec import AgentIdentity


async def test_http_plan_denial_has_a_safe_actionable_code(monkeypatch):
    client = PipedreamClient()
    client.configured = lambda: True
    client.get_access_token = AsyncMock(return_value="test-only")
    response = httpx.Response(400, json={"error": "Tool calling via Pipedream Connect in production is not available on your current plan. Visit pipedream.com/pricing to upgrade your plan."})
    http = AsyncMock()
    http.__aenter__.return_value = http
    http.request.return_value = response
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: http)
    with pytest.raises(PipedreamError) as caught:
        await client._request("GET", "/connect/test/actions", params={"q": "notion"})
    assert caught.value.code == "PIPEDREAM_PLAN_REQUIRED"
    assert "pricing" not in str(caught.value)


async def test_required_app_search_does_not_turn_plan_denial_into_empty_catalog():
    registry = ProviderRegistry.__new__(ProviderRegistry)
    registry._providers = {"pipedream": SimpleNamespace(search_tools=AsyncMock(side_effect=PipedreamError("PIPEDREAM_PLAN_REQUIRED")))}
    with pytest.raises(PipedreamError, match="PIPEDREAM_PLAN_REQUIRED"):
        await registry.search_tools("notion search")


async def test_unrelated_native_search_still_works_during_provider_plan_denial():
    tool = SimpleNamespace(tool_id="calculator")
    registry = ProviderRegistry.__new__(ProviderRegistry)
    registry._providers = {
        "native": SimpleNamespace(search_tools=AsyncMock(return_value=[tool])),
        "pipedream": SimpleNamespace(search_tools=AsyncMock(side_effect=PipedreamError("PIPEDREAM_PLAN_REQUIRED"))),
    }
    assert await registry.search_tools("calculator") == [tool]


async def test_builder_reports_denial_without_a_false_ready_agent():
    orchestrator = BuilderOrchestrator.__new__(BuilderOrchestrator)
    orchestrator.db = SimpleNamespace(
        insert_assistant_message=AsyncMock(return_value="message"),
        get_owned_run=AsyncMock(return_value={"input": {"locale": "fr"}}),
        update_assistant_message=AsyncMock(), fail_run=AsyncMock(), update_agent_status=AsyncMock(),
    )
    orchestrator._continue_build_steps = AsyncMock(side_effect=PipedreamError("PIPEDREAM_PLAN_REQUIRED"))
    result = await orchestrator._continue_build_inner(
        run_id="run", user_id="owner", agent_id="qa", thread_id="thread",
        content="Crée un agent avec Notion.", identity=AgentIdentity(name="QA", role="Read only"),
        complexity=TaskComplexity.STANDARD, current_spec=None,
    )
    assert result["error"] == "PIPEDREAM_PLAN_REQUIRED"
    orchestrator.db.fail_run.assert_awaited_once_with("run", "PIPEDREAM_PLAN_REQUIRED")
    orchestrator.db.update_agent_status.assert_awaited_once_with("qa", "owner", "needs_attention")
    shown = orchestrator.db.update_assistant_message.call_args.kwargs
    assert "forfait Pipedream" in shown["content"]
    assert shown["metadata"]["completed"] is True
    # A progress card hides content and remains non-terminal in the web chat.
    assert "card" not in shown["metadata"]
