"""M4 — normalized LLM error taxonomy + exact-model validation."""

from __future__ import annotations

import pytest

from agent_service.gateway.llm_validation import (
    classify_llm_error,
    exact_model_route,
    validate_model,
)


class _Err(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        if status_code is not None:
            self.status_code = status_code


def test_classify_invalid_auth():
    assert classify_llm_error(_Err("Incorrect API key provided", 401)).status == "invalid_auth"
    assert classify_llm_error(_Err("unauthorized")).status == "invalid_auth"


def test_classify_model_not_found():
    r = classify_llm_error(_Err("The model `gpt-9` does not exist", 404))
    assert r.status == "model_not_found"
    assert r.error_code == "MODEL_NOT_FOUND"


def test_classify_quota_and_rate_limit():
    assert classify_llm_error(_Err("You exceeded your current quota")).status == "insufficient_quota"
    assert classify_llm_error(_Err("Rate limit reached", 429)).status == "rate_limited"


def test_classify_network_and_provider_error():
    assert classify_llm_error(_Err("Connection error: timed out")).status == "network_error"
    assert classify_llm_error(_Err("Internal server error", 503)).status == "provider_error"


def test_classify_unknown_default():
    assert classify_llm_error(_Err("something weird")).status == "unknown"


def test_exact_model_route():
    assert exact_model_route("openai", "gpt-4o-mini") == "openai/gpt-4o-mini"
    assert exact_model_route("google", "gemini-2.0-flash") == "gemini/gemini-2.0-flash"
    assert exact_model_route("openrouter", "openai/gpt-4o-mini") == "openrouter/openai/gpt-4o-mini"
    # Already-prefixed passthrough.
    assert exact_model_route("anthropic", "anthropic/claude-3-5-sonnet") == "anthropic/claude-3-5-sonnet"


async def test_validate_model_mock_valid(monkeypatch):
    monkeypatch.setenv("AI_EXECUTION_MODE", "mock")
    from agent_service.config import get_settings

    get_settings.cache_clear()
    result = await validate_model(provider="openai", model_id="gpt-4o-mini", api_key="sk-validkey123")
    assert result.ok
    get_settings.cache_clear()


async def test_validate_model_mock_invalid_key(monkeypatch):
    monkeypatch.setenv("AI_EXECUTION_MODE", "mock")
    from agent_service.config import get_settings

    get_settings.cache_clear()
    result = await validate_model(provider="openai", model_id="gpt-4o-mini", api_key="invalid")
    assert result.status == "invalid_auth"
    get_settings.cache_clear()


async def test_validate_model_missing_model():
    result = await validate_model(provider="openai", model_id="", api_key="sk-validkey123")
    assert result.status == "model_not_found"


@pytest.mark.parametrize("provider", ["mistral", "groq"])
async def test_validate_model_allows_mistral_groq_mock(monkeypatch, provider):
    monkeypatch.setenv("AI_EXECUTION_MODE", "mock")
    from agent_service.config import get_settings

    get_settings.cache_clear()
    result = await validate_model(provider=provider, model_id="some-model", api_key="sk-validkey123")
    assert result.ok
    get_settings.cache_clear()
