"""Unit tests for Pipedream LLM credential resolution helpers."""

from __future__ import annotations

import pytest

from agent_service.integrations.pipedream.llm import (
    extract_api_key_from_credentials,
    pipedream_apps_for_provider,
    provider_for_pipedream_app,
    resolve_pipedream_llm_credentials,
)


def test_extract_api_key_variants():
    assert extract_api_key_from_credentials({"api_key": "sk-test"}) == "sk-test"
    assert extract_api_key_from_credentials({"apiKey": " sk-x "}) == "sk-x"
    assert (
        extract_api_key_from_credentials({"$auth": {"openai_api_key": "sk-nested"}})
        == "sk-nested"
    )
    assert extract_api_key_from_credentials({}) is None
    assert extract_api_key_from_credentials(None) is None


def test_provider_app_maps():
    assert "openai" in pipedream_apps_for_provider("openai")
    assert "mistral_ai" in pipedream_apps_for_provider("mistral")
    assert provider_for_pipedream_app("anthropic") == "anthropic"
    assert provider_for_pipedream_app("xai") == "xai"
    assert provider_for_pipedream_app("mistral_ai") == "mistral"


@pytest.mark.asyncio
async def test_resolve_pipedream_llm_credentials(monkeypatch):
    class FakeClient:
        def configured(self) -> bool:
            return True

        async def list_accounts(self, *, external_user_id, app=None, include_credentials=False):
            assert external_user_id == "user-1"
            if app == "openai" and include_credentials:
                return [
                    {
                        "id": "apn_1",
                        "app_id": "openai",
                        "healthy": True,
                        "credentials": {"api_key": "sk-from-pd"},
                    }
                ]
            return []

    monkeypatch.setattr(
        "agent_service.integrations.pipedream.client.PipedreamClient",
        FakeClient,
    )
    result = await resolve_pipedream_llm_credentials(
        user_id="user-1",
        provider="openai",
    )
    assert result == ("openai", "sk-from-pd")
