"""LiteLLM boundary test — reasoning_effort forwarded for OpenAI models."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from agent_service.gateway.model_gateway import ModelGateway, ModelProfile


@pytest.mark.asyncio
async def test_reasoning_effort_passed_to_litellm(monkeypatch):
    monkeypatch.setenv("AI_EXECUTION_MODE", "live")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    gateway = ModelGateway()
    captured: dict = {}

    async def fake_complete(**kwargs):
        captured.update(kwargs)
        from agent_service.gateway.model_gateway import ModelCallResult

        return ModelCallResult(content="ok", provider="openai", model=kwargs["model"])

    with patch.object(gateway, "_litellm_complete", new=AsyncMock(side_effect=fake_complete)):
        await gateway._complete_inner(
            profile=ModelProfile.CODING,
            messages=[{"role": "user", "content": "hi"}],
            response_model=None,
            temperature=0.1,
            max_tokens=100,
            api_key=None,
            provider=None,
            tools=None,
            model="openai/gpt-5.6-terra",
            reasoning_effort="high",
            coding_stage="patch",
        )

    assert captured.get("reasoning_effort") == "high"
