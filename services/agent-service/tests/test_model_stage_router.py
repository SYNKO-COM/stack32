"""Tests for stage-aware platform model routing."""

from __future__ import annotations

from agent_service.gateway.model_gateway import ModelProfile
from agent_service.gateway.model_stage_router import (
    CodingStage,
    platform_model_chain,
    route_coding_stage,
    route_task_profile,
)


def test_platform_coding_chain_excludes_xai_and_balanced(monkeypatch):
    monkeypatch.setenv("MODEL_CODING_PRIMARY", "openai/gpt-5.6-terra")
    monkeypatch.setenv("MODEL_CODING_FALLBACK", "openai/gpt-5.6-sol")
    monkeypatch.setenv("MODEL_CODING_EXPERT", "openai/gpt-5.6-sol")
    monkeypatch.setenv("MODEL_CODING_EXTERNAL_EXPERT", "anthropic/claude-sonnet-5")
    from agent_service.config import get_settings

    get_settings.cache_clear()
    chain = platform_model_chain(ModelProfile.CODING)
    assert all("xai" not in m and "grok" not in m for m in chain)
    assert "openai/gpt-5.6-terra" in chain


def test_expert_escalation_only_after_failures(monkeypatch):
    monkeypatch.setenv("MODEL_CODING_EXTERNAL_EXPERT", "anthropic/claude-sonnet-5")
    monkeypatch.setenv("MODEL_CODING_EXPERT", "openai/gpt-5.6-sol")
    monkeypatch.setenv("MODEL_CODING_PRIMARY", "openai/gpt-5.6-terra")
    from agent_service.config import get_settings

    get_settings.cache_clear()
    normal = route_coding_stage(CodingStage.PATCH)
    assert "claude" not in normal.model.lower()
    expert = route_coding_stage(CodingStage.REPAIR_EXPERT, prior_failures=3, repair_attempt=3)
    assert "claude" in expert.model.lower()


def test_fast_route_uses_luna(monkeypatch):
    monkeypatch.setenv("MODEL_FAST_PRIMARY", "openai/gpt-5.6-luna")
    from agent_service.config import get_settings

    get_settings.cache_clear()
    route = route_task_profile(ModelProfile.FAST)
    assert route.model == "openai/gpt-5.6-luna"
    assert route.reasoning_effort is not None
    assert route.reasoning_effort.value == "low"


def test_router_does_not_downgrade_coding_to_balanced():
    from agent_service.gateway.router import TaskType, route_profile

    profile = route_profile(TaskType.REPAIR, budget_remaining_usd=0.1)
    assert profile == ModelProfile.CODING
