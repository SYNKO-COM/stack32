"""M-G: OAuth token refresh helpers (unit-tested, no live Google)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from agent_service.connections import manager as mgr
from agent_service.connections.manager import ConnectionError, ConnectionManager, scopes_for_tools


def test_needs_refresh_logic():
    now = datetime.now(UTC)
    assert ConnectionManager._needs_refresh(None) is False
    assert ConnectionManager._needs_refresh((now + timedelta(hours=1)).isoformat()) is False
    assert ConnectionManager._needs_refresh((now + timedelta(seconds=30)).isoformat()) is True
    assert ConnectionManager._needs_refresh((now - timedelta(minutes=5)).isoformat()) is True
    assert ConnectionManager._needs_refresh("not-a-date") is False


def test_scopes_for_tools_dedup_and_openid():
    scopes = scopes_for_tools(["gmail_send", "calendar_create_event"])
    assert "openid" in scopes
    assert "https://www.googleapis.com/auth/gmail.send" in scopes
    assert "https://www.googleapis.com/auth/calendar.events" in scopes
    assert len(scopes) == len(set(scopes))


def test_select_scoped_connection_prefers_covering_scopes():
    send_scopes = scopes_for_tools(["gmail_send_message"])
    read_only = {"id": "read", "scopes": scopes_for_tools(["gmail_list"])}
    sender = {"id": "send", "scopes": send_scopes}
    rows = [read_only, sender]
    chosen = ConnectionManager._select_scoped_connection(
        rows, provider="google", tool_id="gmail_send_message"
    )
    assert chosen["id"] == "send"


def test_select_scoped_connection_falls_back_to_first():
    rows = [{"id": "a", "scopes": []}, {"id": "b", "scopes": []}]
    # Non-google provider ignores scoping entirely.
    assert (
        ConnectionManager._select_scoped_connection(
            rows, provider="slack", tool_id="anything"
        )["id"]
        == "a"
    )
    # No tool_id → first row.
    assert (
        ConnectionManager._select_scoped_connection(
            rows, provider="google", tool_id=None
        )["id"]
        == "a"
    )


def test_select_scoped_connection_partial_overlap_best_effort():
    rows = [
        {"id": "none", "scopes": ["openid"]},
        {"id": "partial", "scopes": scopes_for_tools(["gmail_list"])},
    ]
    # No connection fully covers send; pick the one with most overlap.
    chosen = ConnectionManager._select_scoped_connection(
        rows, provider="google", tool_id="gmail_send_message"
    )
    assert chosen["id"] == "partial"


class _FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class _FakeAsyncClient:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, *args, **kwargs):
        return self._response


async def test_refresh_google_token_success(monkeypatch):
    monkeypatch.setattr(
        mgr.httpx, "AsyncClient",
        lambda *a, **k: _FakeAsyncClient(_FakeResponse(200, {"access_token": "new-token", "expires_in": 3600})),
    )
    token = await ConnectionManager()._refresh_google_token("refresh-abc")
    assert token["access_token"] == "new-token"


async def test_refresh_google_token_failure(monkeypatch):
    monkeypatch.setattr(
        mgr.httpx, "AsyncClient",
        lambda *a, **k: _FakeAsyncClient(_FakeResponse(400, {"error": "invalid_grant"})),
    )
    with pytest.raises(ConnectionError):
        await ConnectionManager()._refresh_google_token("bad")
