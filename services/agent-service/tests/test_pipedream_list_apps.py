"""Tests for paginated Pipedream app catalog listing."""

from __future__ import annotations

import pytest

from agent_service.integrations.pipedream.client import PipedreamClient


@pytest.mark.asyncio
async def test_list_all_apps_paginates_with_after_cursor(monkeypatch) -> None:
    client = PipedreamClient()
    pages = [
        {
            "data": [{"name_slug": "slack", "name": "Slack"}],
            "page_info": {"end_cursor": "cursor_2", "count": 1},
        },
        {
            "data": [{"name_slug": "notion", "name": "Notion"}],
            "page_info": {"end_cursor": "cursor_3", "count": 1},
        },
        {"data": [], "page_info": {}},
    ]
    calls: list[dict] = []

    async def fake_request(method, path, *, json=None, params=None):
        assert path == "/apps"
        calls.append(dict(params or {}))
        return pages[len(calls) - 1]

    monkeypatch.setattr(client, "configured", lambda: True)
    monkeypatch.setattr(client, "_request", fake_request)

    apps = await client.list_all_apps(max_apps=10)
    assert len(apps) == 2
    slugs = {str(a["app_id"]) for a in apps}
    assert "slack" in slugs
    assert "notion" in slugs
    assert calls[0].get("after") is None
    assert calls[1].get("after") == "cursor_2"
