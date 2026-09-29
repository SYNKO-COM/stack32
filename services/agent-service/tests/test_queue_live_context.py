"""Queued Live turns retain the installation and definition chosen at intake."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from agent_service.queue import worker
from agent_service.runtime import live


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("owner", "use_published"),
    [(True, False), (True, True), (False, True)],
)
async def test_queued_live_keeps_installation_and_definition(
    monkeypatch, owner, use_published
):
    draft = object()
    published = object()
    db = SimpleNamespace(
        get_owned_agent=AsyncMock(return_value={"id": "agent"} if owner else None),
        _select=AsyncMock(return_value=[{"id": "agent"}]),
        load_draft_spec=AsyncMock(return_value=draft),
        fail_run=AsyncMock(),
    )
    execute = AsyncMock(return_value={"status": "completed"})
    published_loader = AsyncMock(return_value=published)
    monkeypatch.setattr(live, "LiveRuntime", lambda _: SimpleNamespace(execute_live_run=execute))
    monkeypatch.setattr(live, "load_published_spec_for_external_run", published_loader)

    result = await worker._process_run_by_id_inner(
        db=db,
        run={
            "status": "queued",
            "run_type": "live",
            "thread_id": "thread",
            "installation_id": "owner-install" if owner else "subscriber-install",
            "input": {"prompt": "Read my tab", "use_published": use_published},
        },
        run_id="run",
        user_id="user",
        agent_id="agent",
    )

    assert result == {"status": "completed"}
    expected_installation = "owner-install" if owner else "subscriber-install"
    assert execute.await_args.kwargs["installation_id"] == expected_installation
    if use_published or not owner:
        published_loader.assert_awaited_once_with(
            db, agent_id="agent", installation_id=expected_installation
        )
        assert execute.await_args.kwargs["spec"] is published
        db.load_draft_spec.assert_not_awaited()
    else:
        published_loader.assert_not_awaited()
        db.load_draft_spec.assert_awaited_once_with("agent", "user")
        assert execute.await_args.kwargs["spec"] is draft


@pytest.mark.asyncio
async def test_queued_live_without_installation_stays_unbound(monkeypatch):
    db = SimpleNamespace(
        get_owned_agent=AsyncMock(return_value={"id": "agent"}),
        load_draft_spec=AsyncMock(return_value=object()),
    )
    execute = AsyncMock(return_value={"status": "completed"})
    monkeypatch.setattr(live, "LiveRuntime", lambda _: SimpleNamespace(execute_live_run=execute))

    await worker._process_run_by_id_inner(
        db=db,
        run={"status": "queued", "run_type": "live", "thread_id": "thread", "input": {"prompt": "Write"}},
        run_id="run",
        user_id="user",
        agent_id="agent",
    )

    assert execute.await_args.kwargs["installation_id"] is None


@pytest.mark.asyncio
async def test_consumer_queue_stops_if_agent_is_no_longer_published(monkeypatch):
    db = SimpleNamespace(
        get_owned_agent=AsyncMock(return_value=None),
        _select=AsyncMock(return_value=[]),
        fail_run=AsyncMock(),
    )
    execute = AsyncMock()
    monkeypatch.setattr(live, "LiveRuntime", lambda _: SimpleNamespace(execute_live_run=execute))

    result = await worker._process_run_by_id_inner(
        db=db,
        run={"status": "queued", "run_type": "live", "thread_id": "thread", "input": {"prompt": "Read"}},
        run_id="run",
        user_id="subscriber",
        agent_id="agent",
    )

    assert result == {"error": "AGENT_UNAVAILABLE"}
    db.fail_run.assert_awaited_once_with("run", "AGENT_UNAVAILABLE")
    execute.assert_not_awaited()
