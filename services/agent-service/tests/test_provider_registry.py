"""Provider registry + native / custom_api resolution."""

from __future__ import annotations

from agent_service.integrations import get_provider_registry
from agent_service.integrations.native import NATIVE_TOOLS


async def test_registry_lists_providers():
    registry = get_provider_registry()
    names = set(registry.list_providers())
    assert names == {"native", "pipedream", "custom_api"}


async def test_resolve_native_tool():
    registry = get_provider_registry()
    ref = await registry.resolve_tool_ref("web_search")
    assert ref is not None
    assert ref.provider == "native"
    assert ref.tool_id == "web_search"


async def test_resolve_http_request_custom_api():
    registry = get_provider_registry()
    ref = await registry.resolve_tool_ref("http_request")
    assert ref is not None
    assert ref.provider == "custom_api"


async def test_search_tools_finds_gmail():
    registry = get_provider_registry()
    tools = await registry.search_tools("gmail", limit=10)
    ids = {t.tool_id for t in tools}
    assert "gmail_list" in ids or "gmail_send_message" in ids


async def test_native_tools_include_expected():
    ids = {t.tool_id for t in NATIVE_TOOLS}
    for expected in (
        "web_search",
        "fetch_url",
        "knowledge_search",
        "calculator",
        "current_datetime",
        "structured_output",
        "gmail_list",
        "gmail_create_draft",
        "gmail_send_message",
        "calendar_list",
        "calendar_create_event",
    ):
        assert expected in ids


async def test_pipedream_health_degraded_without_creds():
    from agent_service.integrations.pipedream.provider import PipedreamToolProvider

    class _UnconfiguredClient:
        def configured(self) -> bool:
            return False

        async def get_access_token(self) -> str | None:
            return None

    provider = PipedreamToolProvider(client=_UnconfiguredClient())  # type: ignore[arg-type]
    health = await provider.health_check()
    # Optional integration: unconfigured must not fail the service (ok=True),
    # but must report configured=False + degraded=True.
    assert health["ok"] is True
    assert health["configured"] is False
    assert health["degraded"] is True

    # Registry still reports native as healthy regardless of Pipedream creds.
    registry = get_provider_registry()
    aggregate = await registry.health()
    by_name = {h["provider"]: h for h in aggregate}
    assert by_name["native"]["ok"] is True
    assert "pipedream" in by_name
    assert "degraded" in by_name["pipedream"]
    assert "ok" in by_name["pipedream"]


async def test_execute_native_via_registry():
    registry = get_provider_registry()
    result = await registry.execute_tool(
        "calculator",
        {"expression": "2+3"},
        context={},
    )
    assert result["value"] == 5.0
