"""Runs API — get, cancel, events, SSE stream."""

from __future__ import annotations

import asyncio
import json
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from agent_service.auth import CurrentUser
from agent_service.supabase_client import get_persistence

router = APIRouter(tags=["runs"])


@router.get("/runs/{run_id}")
async def get_run(run_id: UUID, user: CurrentUser) -> dict[str, Any]:
    db = get_persistence()
    run = await db.get_owned_run(str(run_id), user.user_id)
    if not run:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Run not found."})
    return run


@router.post("/runs/{run_id}/cancel")
async def cancel_run(
    run_id: UUID,
    user: CurrentUser,
    request: Request,
) -> dict[str, Any]:
    silent = request.query_params.get("silent") in {"1", "true", "yes"}
    return await _cancel_run_impl(str(run_id), user, silent=silent)


async def _cancel_run_impl(
    run_id: str, user: CurrentUser, *, silent: bool = False
) -> dict[str, Any]:
    db = get_persistence()
    run = await db.cancel_run(run_id, user.user_id)
    if not run:
        raise HTTPException(
            status_code=409,
            detail={"code": "RUN_CANCELED", "message": "Run cannot be canceled."},
        )
    await db.emit_event(run_id, "run.canceled", {"mapping_key": "live.status.canceled"})
    agent_id = run.get("agent_id")
    thread_id = run.get("thread_id")
    run_type = str(run.get("run_type") or "")
    if agent_id and run_type == "build":
        agent = await db.get_owned_agent(str(agent_id), user.user_id)
        restore = "ready" if agent and agent.get("first_ready_celebrated") else "draft"
        await db.update_agent_status(str(agent_id), user.user_id, restore)
    if silent:
        return run
    if thread_id and agent_id:
        pending = await db.find_pending_live_message(run_id=run_id) if run_type == "live" else None
        if pending:
            await db.update_assistant_message(
                message_id=str(pending["id"]),
                content="live:errors.canceled",
                metadata={"tone": "normal", "pending": False, "run_id": run_id},
                table="live_messages",
            )
        else:
            table = "live_messages" if run_type == "live" else "builder_messages"
            content = (
                "live:errors.canceled" if run_type == "live" else "builder:errors.canceledDetail"
            )
            await db.insert_assistant_message(
                thread_id=str(thread_id),
                agent_id=str(agent_id),
                user_id=user.user_id,
                content=content,
                metadata={"tone": "normal", "run_id": run_id},
                table=table,
                run_id=run_id if run_type == "live" else None,
            )
    return run


@router.post("/agents/{agent_id}/live/cancel")
async def cancel_active_live_run(
    agent_id: UUID, user: CurrentUser, request: Request
) -> dict[str, Any]:
    """Cancel in-flight live runs (Stop / Clear conversation / Structure refresh)."""
    db = get_persistence()
    actives = await db.list_active_live_runs(agent_id=str(agent_id), user_id=user.user_id)
    if not actives:
        return {"status": "idle"}
    silent = request.query_params.get("silent") in {"1", "true", "yes"}
    last: dict[str, Any] | None = None
    for row in actives:
        try:
            last = await _cancel_run_impl(str(row["id"]), user, silent=silent)
        except HTTPException:
            continue
    return last or {"status": "idle"}


@router.post("/agents/{agent_id}/builder/cancel")
async def cancel_active_builder_run(agent_id: UUID, user: CurrentUser) -> dict[str, Any]:
    """Cancel the latest in-flight build run for this agent (Stop button)."""
    db = get_persistence()
    active = await db.get_latest_active_build_run(agent_id=str(agent_id), user_id=user.user_id)
    if not active:
        return {"status": "idle"}
    return await cancel_run(UUID(str(active["id"])), user)


@router.get("/runs/{run_id}/events")
async def list_events(run_id: UUID, user: CurrentUser) -> dict[str, Any]:
    db = get_persistence()
    events = await db.list_run_events(str(run_id), user.user_id)
    return {"events": events}


@router.get("/runs/{run_id}/stream")
async def stream_events(
    run_id: UUID,
    user: CurrentUser,
    request: Request,
) -> StreamingResponse:
    db = get_persistence()
    run = await db.get_owned_run(str(run_id), user.user_id)
    if not run:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Run not found."})

    last_event_id = request.headers.get("Last-Event-ID") or request.query_params.get("last_event_id")
    try:
        start_seq = int(last_event_id) if last_event_id else 0
    except ValueError:
        start_seq = 0

    async def event_generator():
        last_seq = start_seq
        idle_rounds = 0
        for _ in range(240):  # ~120s at 0.5s
            events = await db.list_run_events(str(run_id), user.user_id)
            emitted = False
            for ev in events:
                seq = int(ev.get("sequence") or 0)
                if seq > last_seq:
                    last_seq = seq
                    emitted = True
                    payload = {
                        "id": ev.get("id"),
                        "type": ev.get("event_type"),
                        "sequence": seq,
                        "payload": ev.get("payload") or {},
                        "created_at": ev.get("created_at"),
                    }
                    yield f"id: {seq}\ndata: {json.dumps(payload)}\n\n"
            current = await db.get_owned_run(str(run_id), user.user_id)
            if current and current.get("status") in ("completed", "failed", "canceled"):
                yield f"data: {json.dumps({'type': 'stream.end', 'status': current.get('status')})}\n\n"
                break
            if not emitted:
                idle_rounds += 1
                if idle_rounds % 10 == 0:
                    yield ": keepalive\n\n"
            else:
                idle_rounds = 0
            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
