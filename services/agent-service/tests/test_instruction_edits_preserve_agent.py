"""Regression: a requested output change must not erase an agent's other mission."""
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from agent_service.builder.instruction_edit import (
    InstructionPatch,
    InstructionReplacement,
    apply_instruction_patch,
    edit_instructions,
)
from agent_service.builder.orchestrator import BuilderOrchestrator
from agent_service.builder.repair_contract import RepairContract
from agent_service.builder.spec_diff_guard import clamp_spec_to_repair_contract
from agent_service.gateway.router import TaskComplexity
from agent_service.models.agent_spec import (
    AgentIdentity,
    AgentInstructions,
    AgentRule,
    AgentSpec,
    ModelConfig,
    ModelPolicy,
    ToolBinding,
)
from agent_service.models.graph_spec import default_linear_graph


@pytest.fixture
def original():
    return AgentSpec(
        identity=AgentIdentity(name="QA", role="Calcul et page publique"),
        goal="Calcul et page publique",
        instructions=AgentInstructions(
            system='Réponds en français. Calcule avec calculator et renvoie {"resultat": nombre}. '
                   'Sur demande séparée, lis uniquement https://example.com avec fetch_url. '
                   'Si un outil échoue, ne fabrique pas de résultat.',
            prohibited_actions=["Accéder aux comptes privés"],
        ),
        rules=[AgentRule(id="public_only", text="Ne consulter aucune autre URL."),
               AgentRule(id="no_write", text="Aucune publication ni tâche programmée.")],
        tools=[ToolBinding(tool_id="calculator"), ToolBinding(tool_id="fetch_url")],
        model=ModelConfig(provider="openai", model_id="gpt-5.6-sol"),
        model_policy=ModelPolicy(profile="reasoning"),
        graph=default_linear_graph(["calculator", "fetch_url"]),
    )


def output_patch():
    return InstructionPatch(replacements=[InstructionReplacement(
        target="system", before='{"resultat": nombre}',
        after='{"expression": expression reçue, "resultat": nombre}',
    )])


def test_output_edit_preserves_other_mission_rules_and_model(original):
    updated = apply_instruction_patch(original, output_patch())
    assert '"expression": expression reçue' in updated.instructions.system
    assert 'Sur demande séparée, lis uniquement https://example.com' in updated.instructions.system
    assert 'Si un outil échoue, ne fabrique pas de résultat.' in updated.instructions.system
    for key in original.model_dump():
        if key != "instructions":
            assert getattr(updated, key) == getattr(original, key), key
    assert updated.instructions.prohibited_actions == original.instructions.prohibited_actions
    assert '"expression"' not in original.instructions.system


@pytest.mark.parametrize("before", ["missing anchor", "a"])
def test_stale_or_ambiguous_edit_fails_without_mutating_original(original, before):
    previous = original.model_dump()
    with pytest.raises(ValueError, match="unique_exact_anchor"):
        apply_instruction_patch(original, InstructionPatch(replacements=[
            InstructionReplacement(target="system", before=before, after="wrong")
        ]))
    assert original.model_dump() == previous


async def test_editor_receives_existing_rules_not_just_the_new_request(original):
    gateway = SimpleNamespace(complete=AsyncMock(return_value=output_patch()))
    result = await edit_instructions(gateway, original, "Ajoute l’expression à la sortie.")
    supplied = json.loads(gateway.complete.call_args.kwargs["messages"][1]["content"])
    assert supplied["current_instructions"] == original.instructions.model_dump()
    assert supplied["current_rules"] == [r.model_dump() for r in original.rules]
    assert result.rules == original.rules


async def test_generate_spec_cannot_replace_old_rules_with_blueprint_boilerplate(original):
    orchestrator = BuilderOrchestrator.__new__(BuilderOrchestrator)
    orchestrator.gateway = SimpleNamespace(complete=AsyncMock(return_value=output_patch()))
    orchestrator._design_agent_blueprint = AsyncMock(return_value={
        "system_extra": "Only the new output.", "extra_rules": ["Forget the old mission."]
    })
    orchestrator._select_tools = AsyncMock(return_value=(original.tools, [], []))
    orchestrator._preserved_model = AsyncMock(return_value=original.model)
    updated, _ = await orchestrator._generate_spec(
        "Ajoute l’expression à la sortie.", original.identity, TaskComplexity.STANDARD,
        original, capabilities={"tool_trigger": True, "tool_trigger_component_id": "test", "tool_trigger_app_id": "test"},
    )
    assert updated.rules == original.rules
    assert "uniquement https://example.com" in updated.instructions.system
    assert updated.model_policy == original.model_policy
    assert "Only the new output" not in updated.instructions.system


def test_repair_guard_preserves_policy_even_when_concrete_model_is_unchanged(original):
    proposed = original.model_copy(deep=True)
    proposed.model_policy.profile = "balanced"
    guarded = clamp_spec_to_repair_contract(
        before=original, after=proposed,
        contract=RepairContract(repair_id="qa", user_request="Only output format"),
    )
    assert guarded.model_policy == original.model_policy


async def test_identity_skeleton_still_gets_its_first_complete_mission(original):
    skeleton = original.model_copy(deep=True)
    skeleton.tools = []
    skeleton.instructions.system = "Introduce yourself."
    orchestrator = BuilderOrchestrator.__new__(BuilderOrchestrator)
    orchestrator.gateway = SimpleNamespace(complete=AsyncMock())
    orchestrator._design_agent_blueprint = AsyncMock(return_value={
        "system_extra": "Read only example.com and calculate using calculator.",
    })
    orchestrator._select_tools = AsyncMock(return_value=(original.tools, [], []))
    orchestrator._preserved_model = AsyncMock(return_value=None)
    updated, _ = await orchestrator._generate_spec(
        "Create the first mission.", original.identity, TaskComplexity.STANDARD, skeleton,
        capabilities={"tool_trigger": True, "tool_trigger_component_id": "test", "tool_trigger_app_id": "test"},
    )
    assert "Read only example.com" in updated.instructions.system
    assert "Introduce yourself" not in updated.instructions.system
    orchestrator.gateway.complete.assert_not_called()
