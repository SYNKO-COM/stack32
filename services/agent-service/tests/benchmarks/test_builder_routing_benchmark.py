"""Builder benchmark harness — 18 scenario stubs for routing A/B comparison."""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from agent_service.gateway.model_gateway import ModelProfile
from agent_service.gateway.model_stage_router import CodingStage, route_coding_stage, route_task_profile


@dataclass(frozen=True)
class BenchmarkScenario:
    id: str
    intent: str
    stage: CodingStage
    expect_no_balanced: bool = True
    expect_no_xai: bool = True


SCENARIOS: list[BenchmarkScenario] = [
    BenchmarkScenario("create-scaffold", "create", CodingStage.PATCH),
    BenchmarkScenario("modify-snapshot", "modify", CodingStage.PATCH),
    BenchmarkScenario("repair-sheets", "repair", CodingStage.DIAGNOSE),
    BenchmarkScenario("repair-tool-not-allowed", "repair", CodingStage.REPAIR_HARD),
    BenchmarkScenario("repair-expert", "repair", CodingStage.REPAIR_EXPERT),
    BenchmarkScenario("lint-gate", "repair", CodingStage.VALIDATE),
    BenchmarkScenario("fast-intent", "create", CodingStage.INSPECT),
    BenchmarkScenario("architecture", "create", CodingStage.ARCHITECTURE),
    BenchmarkScenario("identity", "create", CodingStage.INSPECT),
    BenchmarkScenario("validator", "repair", CodingStage.VALIDATE),
    BenchmarkScenario("browser-debug", "repair", CodingStage.DIAGNOSE),
    BenchmarkScenario("context-heavy", "modify", CodingStage.INSPECT),
    BenchmarkScenario("targeted-test", "repair", CodingStage.PATCH),
    BenchmarkScenario("spec-guard", "repair", CodingStage.PATCH),
    BenchmarkScenario("behavior-dry-run", "repair", CodingStage.VALIDATE),
    BenchmarkScenario("budget-reserve", "repair", CodingStage.PATCH),
    BenchmarkScenario("observability", "repair", CodingStage.DIAGNOSE),
    BenchmarkScenario("prod-rollout", "create", CodingStage.PATCH),
]


@pytest.mark.parametrize("scenario", SCENARIOS, ids=[s.id for s in SCENARIOS])
def test_benchmark_routing_no_platform_downgrade(scenario: BenchmarkScenario, monkeypatch):
    monkeypatch.setenv("MODEL_CODING_PRIMARY", "openai/gpt-5.6-terra")
    monkeypatch.setenv("MODEL_CODING_FALLBACK", "openai/gpt-5.6-sol")
    monkeypatch.setenv("MODEL_CODING_EXPERT", "openai/gpt-5.6-sol")
    monkeypatch.setenv("MODEL_CODING_EXTERNAL_EXPERT", "anthropic/claude-sonnet-5")
    monkeypatch.setenv("MODEL_FAST_PRIMARY", "openai/gpt-5.6-luna")
    from agent_service.config import get_settings

    get_settings.cache_clear()

    route = route_coding_stage(
        scenario.stage,
        repair_attempt=2 if scenario.stage == CodingStage.REPAIR_EXPERT else 0,
        prior_failures=3 if scenario.stage == CodingStage.REPAIR_EXPERT else 0,
    )
    assert route.profile == ModelProfile.CODING or scenario.stage == CodingStage.VALIDATE
    model_l = route.model.lower()
    if scenario.expect_no_xai:
        assert "xai" not in model_l and "grok" not in model_l
    if scenario.expect_no_balanced:
        assert "balanced" not in model_l

    fast = route_task_profile(ModelProfile.FAST)
    assert "luna" in fast.model.lower()
