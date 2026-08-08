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
