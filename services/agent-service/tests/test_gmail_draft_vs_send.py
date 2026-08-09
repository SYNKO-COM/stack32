"""Unit tests: gmail_create_draft vs gmail_send_message vs legacy gmail_send."""

from __future__ import annotations

from agent_service.connections import google_tools
from agent_service.tools.runtime import SIDE_EFFECT_TOOLS, execute_tool


async def test_gmail_create_draft_uses_draft_helper(monkeypatch):
    seen = {}

    async def _fake_draft(*, user_id, agent_id, to, subject, body, dry_run=True):
        seen.update(dry_run=dry_run, path="draft")
        return {"draft_id": "d1", "tool": "gmail_create_draft", "dry_run": dry_run}

    async def _fake_send(*, user_id, agent_id, to, subject, body, dry_run=True):
        seen["path"] = "send"
        return {"sent": True}

    monkeypatch.setattr(google_tools, "gmail_send_draft", _fake_draft)
    monkeypatch.setattr(google_tools, "gmail_send_message", _fake_send)
    result = await execute_tool(
        "gmail_create_draft",
        {"to": "a@b.com", "subject": "Hi", "body": "Hello", "dry_run": False},
        context={
            "user_id": "u1",
            "agent_id": "a1",
            "approved_tool_ids": ["gmail_create_draft"],
        },
    )
    assert seen["path"] == "draft"
    assert seen["dry_run"] is False
    assert result.get("draft_id") == "d1"


async def test_gmail_send_message_uses_send_helper(monkeypatch):
    seen = {}

    async def _fake_draft(*, user_id, agent_id, to, subject, body, dry_run=True):
        seen["path"] = "draft"
        return {"draft_id": "d1"}

    async def _fake_send(*, user_id, agent_id, to, subject, body, dry_run=True):
        seen.update(dry_run=dry_run, path="send")
        return {"id": "m1", "sent": True, "tool": "gmail_send_message", "dry_run": dry_run}

    monkeypatch.setattr(google_tools, "gmail_send_draft", _fake_draft)
    monkeypatch.setattr(google_tools, "gmail_send_message", _fake_send)
    result = await execute_tool(
        "gmail_send_message",
        {"to": "a@b.com", "subject": "Hi", "body": "Hello", "dry_run": False},
        context={
            "user_id": "u1",
            "agent_id": "a1",
            "approved_tool_ids": ["gmail_send_message"],
        },
    )
    assert seen["path"] == "send"
    assert seen["dry_run"] is False
    assert result.get("sent") is True


async def test_legacy_gmail_send_prefers_draft(monkeypatch):
    seen = {}

    async def _fake_draft(*, user_id, agent_id, to, subject, body, dry_run=True):
        seen.update(dry_run=dry_run, path="draft")
        return {"draft_id": "d1", "dry_run": dry_run}

    async def _fake_send(*, user_id, agent_id, to, subject, body, dry_run=True):
        seen["path"] = "send"
        return {"sent": True}

    monkeypatch.setattr(google_tools, "gmail_send_draft", _fake_draft)
    monkeypatch.setattr(google_tools, "gmail_send_message", _fake_send)
    result = await execute_tool(
        "gmail_send",
        {"to": "a@b.com", "subject": "Hi", "body": "Hello", "dry_run": False},
        context={"user_id": "u1", "agent_id": "a1", "approved_tool_ids": ["gmail_send"]},
    )
    assert seen["path"] == "draft"
    assert result.get("draft_id") == "d1"


async def test_send_message_requires_approval(monkeypatch):
    captured = {}

    async def _fake_send(*, user_id, agent_id, to, subject, body, dry_run=True):
        captured["dry_run"] = dry_run
        return {"dry_run": dry_run, "tool": "gmail_send_message"}

    monkeypatch.setattr(google_tools, "gmail_send_message", _fake_send)
    result = await execute_tool(
        "gmail_send_message",
        {"to": "a@b.com", "subject": "Hi", "body": "Hello", "dry_run": False},
        context={"user_id": "u1", "agent_id": "a1"},
    )
    assert captured["dry_run"] is True
    assert result.get("approval_required") is True


def test_side_effect_registry_covers_draft_and_send():
    assert "gmail_create_draft" in SIDE_EFFECT_TOOLS
    assert "gmail_send_message" in SIDE_EFFECT_TOOLS
    assert "gmail_send" in SIDE_EFFECT_TOOLS
    assert "http_request" in SIDE_EFFECT_TOOLS
