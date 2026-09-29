"""Browser authority is independent of tool approvals and creator connections."""

from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from agent_service.browser import service as b
from agent_service.builder.tool_review import should_interrupt_tool_review
from agent_service.models.agent_spec import AgentSpec

U, V, INSTALL, J, T, A, VERSION = (str(uuid4()) for _ in range(7))


@pytest.fixture
def enabled(monkeypatch):
    monkeypatch.setattr(
        b,
        "get_settings",
        lambda: SimpleNamespace(
            CHROME_ENABLED=True,
            APP_ORIGIN=b.PREPROD_ORIGIN,
            SUPABASE_URL=b.PREPROD_DATABASE,
            ALLOW_UNVERIFIED_JWT=False,
            SUPABASE_JWT_ISSUER=b.PREPROD_DATABASE + "/auth/v1",
            SUPABASE_JWKS_URL=b.PREPROD_DATABASE + "/auth/v1/.well-known/jwks.json",
        ),
    )


@pytest.fixture
def authority(monkeypatch, enabled):
    install = {"id": INSTALL, "user_id": U, "agent_id": A, "pinned_version_id": VERSION}

    async def get_installation(*, installation_id, user_id):
        return install if (installation_id, user_id) == (INSTALL, U) else None

    monkeypatch.setattr(b.InstallationService, "get_installation", staticmethod(get_installation))

    async def select(self, table, filters):
        if table == "live_threads":
            return [{"id": T}] if filters["id"] == f"eq.{T}" and filters["user_id"] == f"eq.{U}" else []
        if table == "agents":
            return [{"id": A, "user_id": V, "published_version_id": VERSION, "draft_version_id": VERSION}]
        if table == "agent_versions":
            return [{"id": VERSION, "spec": {"chrome_enabled": True, "identity": {"name": "Test"}}}]
        raise AssertionError(table)

    monkeypatch.setattr(b.Persistence, "_select", select)
    return select


@pytest.mark.parametrize(
    "url",
    [
        "http://example.org",
        "https://localhost",
        "https://127.0.0.1",
        "https://192.168.1.1",
        "https://user:password@example.org",
        "https://example.org:444",
        "https://stack32.com",
        "https://service.internal",
        "https://a.supabase.co",
    ],
)
def test_reject_unsafe_sites(url):
    with pytest.raises(ValueError):
        b.origin_of(url)


def test_origin_canonical():
    assert b.origin_of("https://EXAMPLE.org/path?private=secret") == "https://example.org"


@pytest.mark.parametrize(
    "kwargs", [{"selector": "body"}, {"kind": "execute_js"}, {"script": "alert(1)"}, {"value": "x" * 2001}]
)
def test_commands_are_bounded(kwargs):
    data = {"kind": "read", "selector": "#result", "purpose": "Read test result", **kwargs}
    with pytest.raises(ValidationError):
        b.Action.model_validate(data)


def test_legacy_default_does_not_enable_new_capability():
    assert AgentSpec.model_fields["chrome_enabled"].default is None


def test_writing_agent_reviews_capability_without_connections():
    assert should_interrupt_tool_review(
        capabilities={}, proposed=[], current=None, prompt="Write a poem", is_first_build=True
    )
    assert not should_interrupt_tool_review(
        capabilities={"tools_confirmed": True, "confirmed_spec": {}},
        proposed=[],
        current=None,
        prompt="Write a poem",
        is_first_build=True,
    )


async def test_disabled_agent_never_binds_browser(monkeypatch):
    spy = AsyncMock()
    monkeypatch.setattr(b, "authorize", spy)
    assert (
        await b.available_tools(
            spec=SimpleNamespace(chrome_enabled=False), user_id=U, installation_id=INSTALL, thread_id=T
        )
        == []
    )
    spy.assert_not_awaited()


async def test_consumer_authority_is_isolated(authority):
    assert (await b.authorize(U, INSTALL, T))["agent_id"] == A
    for user, installation, thread in [(V, INSTALL, T), (U, J, T), (U, INSTALL, J)]:
        with pytest.raises(HTTPException):
            await b.authorize(user, installation, thread)


async def test_creator_disable_invalidates_old_pin(authority, monkeypatch):
    async def disabled(self, table, filters):
        if table == "agent_versions":
            return [{"id": VERSION, "spec": {"chrome_enabled": False}}]
        return await authority(self, table, filters)

    monkeypatch.setattr(b.Persistence, "_select", disabled)
    with pytest.raises(HTTPException, match="BROWSER_DISABLED"):
        await b.authorize(U, INSTALL, T)


async def test_no_extension_only_binds_harmless_request(authority, monkeypatch):
    req = AsyncMock(return_value=[])
    monkeypatch.setattr(b, "request", req)
    assert await b.available_tools(
        spec=SimpleNamespace(chrome_enabled=True), user_id=U, installation_id=INSTALL, thread_id=T
    ) == ["chrome_request_access"]
    result = await b.execute(
        "chrome_read",
        {"origin": "https://example.org", "selector": "#result", "purpose": "Read"},
        {"user_id": U, "agent_id": A, "installation_id": INSTALL, "thread_id": T, "approved_tool_ids": list(b.TOOLS)},
    )
    assert result["error"] == "BROWSER_ACCESS_REQUIRED"
    assert "/browser?" in result["setup_url"]
    assert all(c.args[0] == "GET" for c in req.call_args_list)


async def test_site_not_granted_never_enqueues(authority, monkeypatch):
    async def req(method, path, *, params=None, body=None):
        assert method == "GET"
        assert params["origin"] == "eq.https://unapproved.example"
        return []

    monkeypatch.setattr(b, "request", req)
    result = await b.execute(
        "chrome_interact",
        {"origin": "https://unapproved.example", "kind": "click", "selector": "#send", "purpose": "Send"},
        {
            "user_id": U,
            "agent_id": A,
            "installation_id": INSTALL,
            "thread_id": T,
            "approved_tool_ids": ["chrome_interact"],
        },
    )
    assert result["interrupt"] and result["error"] == "BROWSER_ACCESS_REQUIRED"


@pytest.mark.parametrize("state", ["revoked", "expired", "disconnected"])
async def test_stale_session_never_binds_actions(authority, monkeypatch, state):
    rows = (
        []
        if state in {"revoked", "expired"}
        else [{"web_seen_at": b.stamp(), "device_seen_at": (b.now() - timedelta(seconds=16)).isoformat()}]
    )
    monkeypatch.setattr(b, "request", AsyncMock(return_value=rows))
    assert await b.available_tools(
        spec=SimpleNamespace(chrome_enabled=True), user_id=U, installation_id=INSTALL, thread_id=T
    ) == ["chrome_request_access"]


async def test_live_session_binds_actions(authority, monkeypatch):
    monkeypatch.setattr(b, "request", AsyncMock(return_value=[{"web_seen_at": b.stamp(), "device_seen_at": b.stamp()}]))
    assert (
        set(
            await b.available_tools(
                spec=SimpleNamespace(chrome_enabled=True), user_id=U, installation_id=INSTALL, thread_id=T
            )
        )
        == b.TOOLS
    )


async def test_logout_expires_device(authority, monkeypatch):
    monkeypatch.setattr(
        b, "request", AsyncMock(return_value=[{"web_seen_at": (b.now() - timedelta(seconds=31)).isoformat()}])
    )
    with pytest.raises(HTTPException, match="BROWSER_SESSION_EXPIRED"):
        await b.session_for_device("a" * 64)


@pytest.mark.parametrize(
    "origin,db",
    [("https://stack32.com", b.PREPROD_DATABASE), (b.PREPROD_ORIGIN, "https://mhwzxpscyvuavpfqxfgm.supabase.co")],
)
def test_cannot_enable_on_production(monkeypatch, origin, db):
    monkeypatch.setattr(
        b, "get_settings", lambda: SimpleNamespace(CHROME_ENABLED=True, APP_ORIGIN=origin, SUPABASE_URL=db)
    )
    with pytest.raises(HTTPException):
        b.deployment_guard()


async def test_no_session_even_with_creator_approved_tools(authority, monkeypatch):
    req = AsyncMock(return_value=[])
    monkeypatch.setattr(b, "request", req)
    from agent_service.tools.runtime import execute_tool

    result = await execute_tool(
        "chrome_interact",
        {"origin": "https://example.org", "kind": "click", "selector": "#send", "purpose": "Send"},
        context={
            "user_id": V,
            "agent_id": A,
            "installation_id": INSTALL,
            "thread_id": T,
            "approved_tool_ids": ["chrome_interact"],
        },
    )
    assert result["error"] == "BROWSER_INSTALLATION_FORBIDDEN"
    req.assert_not_awaited()


@pytest.mark.parametrize("needs_browser", [False, True])
async def test_runtime_pauses_only_when_browser_task_requests_access(authority, monkeypatch, needs_browser):
    from agent_service.models.agent_spec import AgentIdentity, AgentInstructions
    from agent_service.models.graph_spec import default_linear_graph
    from agent_service.runtime import langgraph_runtime as runtime

    requests = AsyncMock(return_value=[])
    monkeypatch.setattr(b, "request", requests)
    answer = SimpleNamespace(content="Draft ready.", tool_calls=[])
    if needs_browser:
        answer = SimpleNamespace(
            content="",
            tool_calls=[
                {
                    "call_id": "browser-call",
                    "tool_id": "chrome_request_access",
                    "arguments": {"origin": "https://example.org"},
                }
            ],
        )
    gateway = SimpleNamespace(complete=AsyncMock(return_value=answer))
    monkeypatch.setattr(runtime, "get_model_gateway", lambda: gateway)
    db = SimpleNamespace(_select=AsyncMock(return_value=[]), emit_event=AsyncMock())
    spec = AgentSpec(
        identity=AgentIdentity(name="Writer", role="Writer"),
        goal="Write",
        instructions=AgentInstructions(system="Write requested text"),
        graph=default_linear_graph([]),
        chrome_enabled=True,
    )
    result = await runtime.run_langgraph_agent(
        db=db,
        run_id=str(uuid4()),
        user_id=U,
        agent_id=A,
        thread_id=T,
        installation_id=INSTALL,
        content="Read my logged-in page" if needs_browser else "Write a poem",
        spec=spec,
        user_creds=None,
    )
    assert gateway.complete.await_count == 1
    assert all(c.args[0] == "GET" for c in requests.call_args_list)
    if needs_browser:
        assert result["interrupt"] == "BROWSER_ACCESS_REQUIRED"
        assert "/browser?" in result["answer"]
    else:
        assert not result.get("interrupt")
        assert result["answer"] == "Draft ready."
        assert not result.get("tool_results")


@pytest.mark.parametrize("owns", [True, False])
async def test_only_creator_can_change_browser_capability(monkeypatch, owns):
    from uuid import UUID

    from agent_service.routers import agents

    spec = SimpleNamespace(chrome_enabled=True)
    db = SimpleNamespace(
        get_owned_agent=AsyncMock(return_value={"id": A} if owns else None),
        load_draft_spec=AsyncMock(return_value=spec),
        persist_version=AsyncMock(return_value={"id": VERSION}),
    )
    monkeypatch.setattr(agents, "get_persistence", lambda: db)
    request = agents.ChromeCapabilityPatch(enabled=False)
    if not owns:
        with pytest.raises(HTTPException):
            await agents.patch_chrome_capability(UUID(A), SimpleNamespace(user_id=V), request)
        db.persist_version.assert_not_awaited()
    else:
        result = await agents.patch_chrome_capability(UUID(A), SimpleNamespace(user_id=V), request)
        assert result["chrome_enabled"] is False
        assert db.persist_version.call_args.kwargs["spec"].chrome_enabled is False


def test_creator_capability_request_rejects_string_booleans():
    from agent_service.routers.agents import ChromeCapabilityPatch

    with pytest.raises(ValidationError):
        ChromeCapabilityPatch(enabled="false")


@pytest.mark.parametrize("origin", ["https://stack32.com.", "https://app.stack32.com.", "https://test.supabase.co.", "http://example.org", "https://example.org:444"])
def test_api_rejects_ineligible_site_before_pairing_mutation(origin):
    from agent_service.routers.browser import Pair

    with pytest.raises(ValidationError):
        Pair(code="a" * 64, origin=origin)


async def test_pair_consumes_hashed_code_once_and_never_returns_account_credentials(authority, monkeypatch):
    row = {"id": J, "origin": "https://example.org", "user_id": U, "installation_id": INSTALL,
           "thread_id": T, "agent_name": "Test", "expires_at": b.stamp()}
    request = AsyncMock(side_effect=[[row], []])
    monkeypatch.setattr(b, "request", request)
    code = "b" * 64
    result = await b.pair(code, "https://example.org")
    assert set(result) == {"token", "session_id", "origin", "agent_name", "expires_at"}
    params = request.call_args.kwargs["params"]
    payload = request.call_args.kwargs["body"]
    assert params["pairing_hash"] == f"eq.{b.digest(code)}"
    assert params["state"] == "eq.pairing"
    assert payload["pairing_hash"] is None
    assert payload["token_hash"] == b.digest(result["token"])
    with pytest.raises(HTTPException, match="BROWSER_PAIRING_EXPIRED"):
        await b.pair(code, "https://example.org")
