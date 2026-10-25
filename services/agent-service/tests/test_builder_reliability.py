"""Regressions reproduced in the user's Chrome session, 25 October 2026."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import BaseModel, ValidationError

from agent_service.builder.conversation import is_read_only_question, operation, reply_locale, spec_changes
from agent_service.builder.orchestrator import BuilderOrchestrator
from agent_service.gateway.builder_models import builder_model_scope, selected_builder_model
from agent_service.gateway.model_gateway import ModelCallResult, ModelGateway, ModelProfile
from agent_service.gateway.openai_responses import responses_input
from agent_service.routers.builder import BuilderMessageRequest
from agent_service.security.llm_budget import RunLlmBudget, _current_budget, llm_run_budget


@pytest.mark.parametrize("message", [
    "Crée un agent de test nommé Compteur", "Create a test agent", "Build a contest assistant",
    "Create an agent that tests JSON", "Crée un assistant de préfixes",
])
def test_create_is_not_a_test_or_fix_substring(message):
    assert operation(message, {"status": "draft"}) == "create"


@pytest.mark.parametrize("state", ["built", "ready", "published", "needs_attention", "needs_setup"])
def test_existing_agent_is_modified_not_recreated(state):
    assert operation("Ajoute un champ au résultat", {"status": state}) == "modify"


@pytest.mark.parametrize("message,expected", [
    ("Test this agent", "test"), ("Teste cet agent", "test"),
    ("Please fix the response", "repair"), ("Corrige le compteur", "repair"),
])
def test_explicit_operations(message, expected):
    assert operation(message, {"status": "built"}) == expected


@pytest.mark.parametrize("message", [
    "S'il te plaît peux-tu me faire un récapitulatif de tous les outils et à quoi ils servent ?",
    "Quels sont ses outils ?", "Explain this agent", "What tools do I have?", "Pourquoi ce choix ?",
    "S’il te plaît, peux-tu me faire un récapitulatif des outils ? Ne modifie rien.",
    "What tools do I have? Don't modify anything.",
])
def test_questions_are_read_only_in_build(message):
    assert is_read_only_question(message)


@pytest.mark.parametrize("message", [
    "Quels outils as-tu ? Ajoute Gmail.", "Can you build an agent?", "Comment modifier mon agent ?",
    "Create a test agent", "Ajoute un outil de recherche",
])
def test_mixed_or_ambiguous_edit_requests_stay_build(message):
    assert not is_read_only_question(message)


def test_language_uses_message_and_explicit_instruction():
    assert reply_locale("Crée un agent avec ces outils, réponds en français.", "en") == "fr"
    assert reply_locale("Je veux ces outils mais réponds en anglais.", "fr") == "en"
    assert reply_locale("CSV", "fr") == "fr"
    assert reply_locale("Build an agent", "en") == "en"


def test_model_tier_is_an_enum_not_arbitrary_provider_input():
    assert BuilderMessageRequest(content="Build", model_tier="max").model_tier == "max"
    with pytest.raises(ValidationError):
        BuilderMessageRequest(content="Build", model_tier="some/arbitrary-model")


@pytest.mark.asyncio
async def test_persisted_choice_restored_and_cleared_on_form_continuation(make_settings):
    make_settings(BUILDER_MODEL_SELECTION_ENABLED=True)
    # builder_models imports settings independently.
    with patch("agent_service.gateway.builder_models.get_settings", return_value=SimpleNamespace(BUILDER_MODEL_SELECTION_ENABLED=True)):
        class Owner:
            db = SimpleNamespace(get_owned_run=AsyncMock(return_value={"input": {"model_tier": "max"}}))

            @builder_model_scope
            async def resume(self, **kwargs):
                return selected_builder_model()

        budget = RunLlmBudget(run_id="r", user_id="u", agent_id="a", max_calls=20)
        token = _current_budget.set(budget)
        try:
            assert await Owner().resume(run_id="r", user_id="u", agent_id="a") == "openai/gpt-6-astra"
            assert selected_builder_model() is None
        finally:
            _current_budget.reset(token)


@pytest.mark.asyncio
async def test_nested_coding_budget_does_not_reset_reservation_or_call_sequence(make_settings):
    make_settings()
    budget = RunLlmBudget(run_id="r", user_id="u", agent_id="a", max_calls=20, max_cost_usd=.2)
    token = _current_budget.set(budget)
    try:
        with patch.object(RunLlmBudget, "_record_per_call_event"):
            budget.register_call(model="m", cost_usd=.03)
            async with llm_run_budget(run_id="r", user_id="u", agent_id="a", max_calls=3, source="coding") as child:
                assert child is budget
                assert child.calls == 1 and child.max_cost_usd == .2 and child.max_calls == 4
                child.register_call(model="m", cost_usd=.04)
            assert budget.calls == 2 and budget.cost_usd == pytest.approx(.07)
            assert budget.source == "builder" and budget.max_calls == 20
    finally:
        _current_budget.reset(token)


@pytest.mark.asyncio
async def test_structured_output_keeps_actual_tokens_model_and_cost(make_settings):
    make_settings(AI_EXECUTION_MODE="live", OPENAI_API_KEY="test")
    class Schema(BaseModel):
        answer: str
    budget = RunLlmBudget(run_id="r", user_id="u", agent_id="a", max_calls=10)
    token = _current_budget.set(budget)
    gateway = ModelGateway()
    gateway._complete_inner = AsyncMock(return_value=ModelCallResult(
        content='{"answer":"oui"}', provider="openai", model="openai/gpt-6.1-sol",
        input_tokens=1000, output_tokens=100, cost_usd=.003,
    ))
    try:
        with patch.object(RunLlmBudget, "_record_per_call_event"):
            result = await gateway.complete(profile=ModelProfile.VALIDATOR, messages=[], response_model=Schema)
        assert result.answer == "oui"
        assert budget.models == ["openai/gpt-6.1-sol"]
        assert (budget.input_tokens, budget.output_tokens, budget.cost_usd) == (1000, 100, .003)
    finally:
        _current_budget.reset(token)


def test_responses_preserves_roles_call_ids_results_and_reasoning():
    messages = [
        {"role": "system", "content": "Trusted instructions"},
        {"role": "user", "content": "Read a test file"},
        {"role": "assistant", "tool_calls": [{"id": "call_1", "function": {"name": "read_file", "arguments": '{"path":"test.txt"}'}}]},
        {"role": "tool", "tool_call_id": "call_1", "content": "hello"},
    ]
    items = responses_input(messages, {"call_1": [{"type": "reasoning", "encrypted_content": "opaque"}]})
    assert items[0] == {"role": "system", "content": "Trusted instructions"}
    assert items[2]["type"] == "reasoning"
    assert items[3]["call_id"] == items[4]["call_id"] == "call_1"
    assert items[4]["output"] == "hello"


@pytest.mark.asyncio
async def test_summary_is_grounded_in_persisted_evidence_not_prompt(make_settings):
    make_settings()
    from agent_service.models.agent_spec import AgentIdentity
    orch = BuilderOrchestrator(MagicMock())
    orch.gateway = MagicMock()
    orch.gateway.complete = AsyncMock(return_value=SimpleNamespace(content="La validation reste incomplète."))
    answer = await orch._compose_builder_reply(
        user_prompt="Crée Gmail CRM Calendar", identity=AgentIdentity(name="Compteur", role="Count text"),
        status="needs_attention", first_ready=False, file_paths=["tools.json"],
        test_report={"status": "passed"}, build_ok=False, detected_problems=["Sandbox unavailable"],
        changes={"enabled_tools": ["calculator"], "changed_sections": ["instructions"]}, locale="fr",
    )
    assert answer == "La validation reste incomplète."
    messages = orch.gateway.complete.await_args.kwargs["messages"]
    assert "connected tools (email" not in str(messages)
    assert '"enabled_tools": ["calculator"]' in messages[1]["content"]
    assert '"sandbox_build_ok": false' in messages[1]["content"]


def test_spec_changes_preserve_tools_and_show_actual_sections():
    from agent_service.models.agent_spec import AgentIdentity, AgentInstructions, AgentSpec, ToolBinding
    from agent_service.models.graph_spec import default_linear_graph
    before = AgentSpec(identity=AgentIdentity(name="Counter", role="Count"), goal="Count words",
                       instructions=AgentInstructions(system="Count words"), graph=default_linear_graph([]),
                       tools=[ToolBinding(tool_id="calculator")])
    after = before.model_copy(deep=True)
    after.instructions.system = "Count words and characters"
    changes = spec_changes(before, after)
    assert changes["changed_sections"] == ["instructions"]
    assert changes["tools_added"] == changes["tools_removed"] == []
    assert changes["enabled_tools"] == ["calculator"]


@pytest.mark.asyncio
async def test_gpt6_responses_tool_boundary_and_cached_usage(make_settings):
    make_settings(OPENAI_API_KEY="test")
    from agent_service.gateway.openai_responses import complete_responses, provider_tool_name
    alias = provider_tool_name("workspace.read_file")
    assert "." not in alias and len(alias) <= 64
    assert alias != provider_tool_name("workspace_read_file")
    response = SimpleNamespace(
        id="resp_unit", output_text="", usage=SimpleNamespace(
            input_tokens=1000, output_tokens=100, input_tokens_details=SimpleNamespace(cached_tokens=600)),
        output=[SimpleNamespace(type="function_call", name=alias, call_id="c1", arguments='{"path":"test.txt"}')],
    )
    create = AsyncMock(return_value=response)
    client = MagicMock()
    client.__aenter__ = AsyncMock(return_value=SimpleNamespace(responses=SimpleNamespace(create=create)))
    client.__aexit__ = AsyncMock(return_value=False)
    with patch("agent_service.gateway.openai_responses.AsyncOpenAI", return_value=client):
        result = await complete_responses(
            model="openai/gpt-6-astra", messages=[{"role": "user", "content": "read test"}],
            max_tokens=4096, api_key="test", tools=[{"type": "function", "function": {
                "name": "workspace.read_file", "parameters": {"type": "object", "properties": {}}}}],
            reasoning_effort="none", json_output=False,
        )
    kwargs = create.await_args.kwargs
    assert kwargs["reasoning"] == {"effort": "low"}
    assert "temperature" not in kwargs and kwargs["store"] is False
    assert kwargs["tools"][0]["name"] == alias
    assert result.tool_calls[0]["tool_id"] == "workspace.read_file"
    assert result.cost_usd == pytest.approx(.0096)
    assert result.usage_id == "resp_unit"


@pytest.mark.parametrize("model,expected", [
    ("openai/gpt-6-luna", .00015), ("openai/gpt-6.1-sol", .003), ("openai/gpt-6-astra", .015),
])
def test_new_tiers_charge_actual_token_rates(model, expected):
    from agent_service.billing.pricing import estimate_cost_usd_from_tokens
    assert estimate_cost_usd_from_tokens(model, 1000, 100)[0] == pytest.approx(expected)


def test_form_continuations_have_distinct_usage_scopes():
    first = RunLlmBudget(run_id="r", user_id="u", agent_id="a", max_calls=20)
    resumed = RunLlmBudget(run_id="r", user_id="u", agent_id="a", max_calls=20)
    assert first.scope_id != resumed.scope_id


@pytest.mark.asyncio
async def test_stopped_chat_never_publishes_a_late_completion(make_settings):
    make_settings()
    db = AsyncMock()
    db.load_draft_spec.return_value = None
    db._select.return_value = []
    db.get_owned_run.return_value = {"status": "canceled", "input": {}}
    db.get_owned_agent.return_value = {"first_ready_celebrated": True}
    orch = BuilderOrchestrator(db)
    orch.gateway = MagicMock()
    orch.gateway.complete = AsyncMock(return_value=SimpleNamespace(content="Late response"))
    result = await orch._handle_chat_turn(
        run_id="r", user_id="u", agent_id="a", thread_id="t", content="Quels outils ?",
        agent={"status": "built", "name": "QA"}, locale="fr",
    )
    assert result["status"] == "canceled"
    db.insert_assistant_message.assert_not_awaited()
    db.complete_run.assert_not_awaited()
