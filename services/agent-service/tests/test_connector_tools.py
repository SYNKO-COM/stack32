"""M-G: Google connector tools wired into execute_tool with approval gating."""

from __future__ import annotations

import pytest

from agent_service.connections import google_tools
from agent_service.tools import runtime
from agent_service.tools.runtime import ToolError, execute_tool


async def test_connector_requires_agent_context():
    with pytest.raises(ToolError) as exc:
        await execute_tool("gmail_list", {"query": "hello"}, context={})
    assert exc.value.code == "TOOL_CONTEXT_MISSING"


async def test_gmail_list_dispatches_with_bindings(monkeypatch):
    seen = {}

    async def _fake_list(*, user_id, agent_id, query="", max_results=10, dry_run=False):
        seen.update(user_id=user_id, agent_id=agent_id, query=query, max_results=max_results)
        return {"messages": [], "resultSizeEstimate": 0}

    monkeypatch.setattr(google_tools, "gmail_list", _fake_list)
    result = await execute_tool(
        "gmail_list",
        {"query": "invoices", "max_results": 5},
        context={"user_id": "u1", "agent_id": "a1"},
    )
    assert result["resultSizeEstimate"] == 0
    assert seen == {"user_id": "u1", "agent_id": "a1", "query": "invoices", "max_results": 5}


async def test_gmail_send_forces_dry_run_without_approval(monkeypatch):
    captured = {}

    async def _fake_send(*, user_id, agent_id, to, subject, body, dry_run=True):
        captured["dry_run"] = dry_run
        return {"dry_run": dry_run, "tool": "gmail_send"}

    monkeypatch.setattr(google_tools, "gmail_send_draft", _fake_send)
    result = await execute_tool(
        "gmail_send",
        {"to": "x@y.com", "subject": "hi", "body": "hello", "dry_run": False},
        context={"user_id": "u1", "agent_id": "a1"},
    )
    assert captured["dry_run"] is True
    assert result["approval_required"] is True


async def test_gmail_send_real_when_approved(monkeypatch):
    captured = {}

    async def _fake_send(*, user_id, agent_id, to, subject, body, dry_run=True):
        captured["dry_run"] = dry_run
        return {"draft_id": "d123"}

    monkeypatch.setattr(google_tools, "gmail_send_draft", _fake_send)
    result = await execute_tool(
        "gmail_send",
        {"to": "x@y.com", "subject": "hi", "body": "hello", "dry_run": False},
        context={"user_id": "u1", "agent_id": "a1", "approved_tool_ids": ["gmail_send"]},
    )
    assert captured["dry_run"] is False
    assert result.get("draft_id") == "d123"
    assert "approval_required" not in result


def test_side_effect_tools_registry():
    assert "gmail_send" in runtime.SIDE_EFFECT_TOOLS
    assert "gmail_list" not in runtime.SIDE_EFFECT_TOOLS
