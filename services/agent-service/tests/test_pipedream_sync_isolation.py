"""Ensure Pipedream sync never retargets another product app's connection row."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from agent_service.integrations.pipedream import accounts as accounts_mod


class _FakeResponse:
    def __init__(self, status_code: int = 200, payload: Any = None, text: str = ""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        return self._payload


class _FakeSB:
    def __init__(self):
        self.rows: dict[str, dict[str, Any]] = {}
        self.inserts: list[dict[str, Any]] = []
        self.patches: list[dict[str, Any]] = []

    async def get(self, path: str, params: dict[str, str] | None = None):
        params = params or {}
        if "external_account_id" in params:
            ext = params["external_account_id"].removeprefix("eq.")
            for row in self.rows.values():
                if row.get("external_account_id") == ext:
                    return _FakeResponse(200, [row])
            return _FakeResponse(200, [])
        return _FakeResponse(200, list(self.rows.values()))

    async def post(self, path: str, json: dict[str, Any] | None = None, headers=None):
        payload = dict(json or {})
        conn_id = f"conn-{len(self.inserts)+1}"
        payload["id"] = conn_id
        self.rows[conn_id] = payload
        self.inserts.append(payload)
        return _FakeResponse(201, [payload])

    async def patch(self, path: str, params=None, json=None, headers=None):
        params = params or {}
        conn_id = params.get("id", "").removeprefix("eq.")
        self.patches.append({"id": conn_id, "json": dict(json or {})})
        if conn_id in self.rows:
            self.rows[conn_id].update(json or {})
            return _FakeResponse(200, [self.rows[conn_id]])
        return _FakeResponse(404, [], "missing")


class _FakeSBCM:
    def __init__(self, sb: _FakeSB):
        self.sb = sb

    async def __aenter__(self):
        return self.sb

    async def __aexit__(self, *args):
        return False


@pytest.mark.asyncio
async def test_sync_does_not_overwrite_calendar_when_syncing_notion():
    sb = _FakeSB()
    # Existing Google Calendar connection
    sb.rows["calendar-row"] = {
        "id": "calendar-row",
        "user_id": "u1",
        "provider": "pipedream",
        "status": "active",
        "account_email": "same@example.com",
        "external_account_id": "apn_calendar",
        "provider_metadata": {"app_id": "google_calendar"},
    }

    pd_accounts = [
        {
            "id": "apn_notion",
            "app_id": "notion",
            "name": "Notion Workspace",
            "email": "same@example.com",
            "healthy": True,
            "raw": {"dead": False},
        }
    ]

    fake_client = MagicMock()
    fake_client.list_accounts = AsyncMock(return_value=pd_accounts)

    with (
        patch.object(accounts_mod, "PipedreamClient", return_value=fake_client),
        patch.object(accounts_mod, "get_supabase_admin_client", return_value=_FakeSBCM(sb)),
    ):
        synced = await accounts_mod.sync_pipedream_accounts(
            user_id="u1", app_id="notion"
        )

    assert len(synced) == 1
    assert synced[0]["app_id"] == "notion"
    assert synced[0]["connection_id"] != "calendar-row"
    # Calendar row must stay google_calendar
    assert sb.rows["calendar-row"]["provider_metadata"]["app_id"] == "google_calendar"
    assert sb.rows["calendar-row"]["external_account_id"] == "apn_calendar"
    # Notion got its own row
    notion_rows = [
        r
        for r in sb.rows.values()
        if (r.get("provider_metadata") or {}).get("app_id") == "notion"
    ]
    assert len(notion_rows) == 1
    assert notion_rows[0]["external_account_id"] == "apn_notion"


@pytest.mark.asyncio
async def test_sync_updates_same_external_account_in_place():
    sb = _FakeSB()
    sb.rows["canva-row"] = {
        "id": "canva-row",
        "user_id": "u1",
        "provider": "pipedream",
        "status": "revoked",
        "account_email": None,
        "external_account_id": "apn_canva",
        "provider_metadata": {"app_id": "canva"},
    }
    pd_accounts = [
        {
            "id": "apn_canva",
            "app_id": "canva",
            "name": "Synko",
            "email": "synko@example.com",
            "healthy": True,
            "raw": {"dead": False},
        }
    ]
    fake_client = MagicMock()
    fake_client.list_accounts = AsyncMock(return_value=pd_accounts)

    with (
        patch.object(accounts_mod, "PipedreamClient", return_value=fake_client),
        patch.object(accounts_mod, "get_supabase_admin_client", return_value=_FakeSBCM(sb)),
    ):
        synced = await accounts_mod.sync_pipedream_accounts(user_id="u1", app_id="canva")

    assert len(synced) == 1
    assert synced[0]["connection_id"] == "canva-row"
    assert sb.rows["canva-row"]["status"] == "active"
    assert sb.rows["canva-row"]["provider_metadata"]["app_id"] == "canva"
