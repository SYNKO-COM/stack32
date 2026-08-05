"""Runs API — get, cancel, events, SSE stream."""

from __future__ import annotations

import asyncio
import json
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
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
async def cancel_run(run_id: UUID, user: CurrentUser) -> dict[str, Any]:
    db = get_persistence()
    run = await db.cancel_run(str(run_id), user.user_id)
    if not run:
        raise HTTPException(
            status_code=409,
            detail={"code": "RUN_CANCELED", "message": "Run cannot be canceled."},
        )
    await db.emit_event(str(run_id), "run.canceled", {"mapping_key": "errors.runCanceled"})
    return run


@router.get("/runs/{run_id}/events")
async def list_events(run_id: UUID, user: CurrentUser) -> dict[str, Any]:
    db = get_persistence()
    events = await db.list_run_events(str(run_id), user.user_id)
    return {"events": events}


@router.get("/runs/{run_id}/stream")
async def stream_events(run_id: UUID, user: CurrentUser) -> StreamingResponse:
    db = get_persistence()
    run = await db.get_owned_run(str(run_id), user.user_id)
    if not run:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Run not found."})

    async def event_generator():
        last_seq = 0
        for _ in range(120):  # ~60s at 0.5s
            events = await db.list_run_events(str(run_id), user.user_id)
            for ev in events:
                seq = int(ev.get("sequence") or 0)
                if seq > last_seq:
                    last_seq = seq
                    payload = {
                        "id": ev.get("id"),
                        "type": ev.get("event_type"),
                        "sequence": seq,
                        "payload": ev.get("payload") or {},
                        "created_at": ev.get("created_at"),
                    }
                    yield f"data: {json.dumps(payload)}\n\n"
            current = await db.get_owned_run(str(run_id), user.user_id)
            if current and current.get("status") in ("completed", "failed", "canceled"):
                yield f"data: {json.dumps({'type': 'stream.end', 'status': current.get('status')})}\n\n"
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
