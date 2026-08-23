"""A Gmail account connected through Pipedream cannot drive the native tools.

Pipedream's managed OAuth never exports raw credentials, so
``list_accounts(include_credentials=True)`` returns ``credentials: None`` and
``gmail_list`` can only ever answer CONNECTION_REQUIRED. The model picks
``gmail_list`` over ``pd:gmail-list-thread-messages`` every time, so the run
dead-ends telling the user to connect an account they already connected.
"""

from __future__ import annotations

import pytest

from agent_service.tools.runtime import native_google_tools_to_hide

SPEC_WITH_BOTH = [
    "current_datetime",
    "gmail_list",
    "gmail_read",
    "gmail_send_message",
    "pd:gmail-send-email",
    "pd:gmail-list-thread-messages",
]


@pytest.fixture
def pipedream_account(monkeypatch):
    """Pretend the user holds a Pipedream account for whatever app is asked."""

    def _install(apps: set[str]):
        async def fake_resolve(*, user_id, agent_id, tool_id, app_id=None):
            if app_id in apps:
                return {"auth_provision_id": "apn_test", "app_id": app_id}
            return None

        monkeypatch.setattr(
            "agent_service.integrations.pipedream.accounts.resolve_pipedream_auth_for_tool",
            fake_resolve,
        )

    return _install


@pytest.mark.asyncio
async def test_hides_native_gmail_when_pipedream_covers_it(pipedream_account):
    pipedream_account({"gmail"})
    hidden = await native_google_tools_to_hide(
        SPEC_WITH_BOTH, user_id="u1", agent_id="a1"
    )
    assert hidden == {"gmail_list", "gmail_read", "gmail_send_message"}


@pytest.mark.asyncio
async def test_keeps_native_gmail_when_nothing_is_connected(pipedream_account):
    """With no account at all, the native tool's connect prompt is the right answer."""
    pipedream_account(set())
    hidden = await native_google_tools_to_hide(
        SPEC_WITH_BOTH, user_id="u1", agent_id="a1"
    )
    assert hidden == set()


@pytest.mark.asyncio
async def test_keeps_native_gmail_when_spec_has_no_pipedream_alternative(
    pipedream_account,
):
    """Hiding a tool with nothing to fall back on would just remove capability."""
    pipedream_account({"gmail"})
    hidden = await native_google_tools_to_hide(
        ["gmail_list", "gmail_read"], user_id="u1", agent_id="a1"
    )
    assert hidden == set()


@pytest.mark.asyncio
async def test_leaves_unrelated_tools_alone(pipedream_account):
    pipedream_account({"gmail"})
    hidden = await native_google_tools_to_hide(
        SPEC_WITH_BOTH, user_id="u1", agent_id="a1"
    )
    assert "current_datetime" not in hidden
    assert not any(t.startswith("pd:") for t in hidden)


@pytest.mark.asyncio
async def test_calendar_is_independent_of_gmail(pipedream_account):
    """Connecting Gmail must not hide the Calendar tools."""
    pipedream_account({"gmail"})
    hidden = await native_google_tools_to_hide(
        ["gmail_list", "calendar_list", "pd:gmail-send-email", "pd:google_calendar-list-events"],
        user_id="u1",
        agent_id="a1",
    )
    assert hidden == {"gmail_list"}


@pytest.mark.asyncio
async def test_lookup_failure_never_drops_a_tool(monkeypatch):
    async def boom(*, user_id, agent_id, tool_id, app_id=None):
        raise RuntimeError("pipedream unreachable")

    monkeypatch.setattr(
        "agent_service.integrations.pipedream.accounts.resolve_pipedream_auth_for_tool",
        boom,
    )
    hidden = await native_google_tools_to_hide(
        SPEC_WITH_BOTH, user_id="u1", agent_id="a1"
    )
    assert hidden == set()
