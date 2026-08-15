"""Unit tests for builder Chat (read-only) mode."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from agent_service.builder.orchestrator import BuilderOrchestrator


@pytest.mark.asyncio
async def test_chat_mode_never_mutates_and_answers():
    db = MagicMock()
    db.emit_event = AsyncMock()
    db.clear_thinking_messages = AsyncMock()
    db.load_draft_spec = AsyncMock(return_value=None)
    db.insert_assistant_message = AsyncMock()
    db.complete_run = AsyncMock()
    db.fail_run = AsyncMock()
    db.update_run_status = AsyncMock()
    db.tag_thinking_with_run = AsyncMock()
    db.update_agent_status = AsyncMock()
    db.get_owned_agent = AsyncMock(
        return_value={"id": "a1", "name": "Demo", "status": "ready", "user_id": "u1"}
    )

    orch = BuilderOrchestrator(db)
    orch.gateway = MagicMock()
    orch.gateway.complete = AsyncMock(
        return_value=SimpleNamespace(content="You're in Chat mode — switch to Build to edit.")
    )

    result = await orch.execute_build_run(
        run_id="r1",
        user_id="u1",
        agent_id="a1",
        thread_id="t1",
        content="Please add a Slack tool and rewrite the system prompt.",
        agent_row={"id": "a1", "name": "Demo", "status": "ready", "user_id": "u1"},
        mode="chat",
        locale="en",
    )

    assert result["status"] == "completed"
    assert result["mode"] == "chat"
    db.insert_assistant_message.assert_awaited()
    inserted = db.insert_assistant_message.await_args.kwargs
    assert inserted["content"]
    assert inserted["metadata"]["mode"] == "chat"
    db.update_agent_status.assert_not_awaited()
    db.complete_run.assert_awaited_with("r1")

    messages = orch.gateway.complete.await_args.kwargs["messages"]
    system = messages[0]["content"]
    assert "Chat mode" in system or "read-only" in system.lower()
    assert "Build" in system


@pytest.mark.asyncio
async def test_build_mode_does_not_use_chat_handler():
    db = MagicMock()
    db.emit_event = AsyncMock()
    db.clear_thinking_messages = AsyncMock()
    db.load_draft_spec = AsyncMock(return_value=None)
    db.tag_thinking_with_run = AsyncMock()
    db.update_run_status = AsyncMock()

    orch = BuilderOrchestrator(db)
    orch._handle_chat_turn = AsyncMock(return_value={"status": "completed", "mode": "chat"})
    orch._continue_build = AsyncMock(return_value={"status": "completed", "mode": "build"})
    orch._classify_intent = MagicMock(return_value="create")
    orch._needs_identity_setup = MagicMock(return_value=False)

    result = await orch.execute_build_run(
        run_id="r2",
        user_id="u1",
        agent_id="a1",
        thread_id="t1",
        content="Build me a research agent",
        agent_row={"id": "a1", "name": "Research", "status": "draft", "user_id": "u1"},
        mode="build",
        locale="en",
    )

    orch._handle_chat_turn.assert_not_awaited()
    orch._continue_build.assert_awaited()
    assert result["mode"] == "build"


def test_builder_message_request_accepts_chat_mode():
    from agent_service.routers.builder import BuilderMessageRequest

    body = BuilderMessageRequest(content="What tools do I have?", mode="chat")
    assert body.mode == "chat"
    body2 = BuilderMessageRequest(content="Add gmail", mode="build")
    assert body2.mode == "build"
