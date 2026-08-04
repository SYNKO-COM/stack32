"""Run streaming endpoints (Phase 1: simulated SSE)."""

import asyncio
import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from agent_service.auth import CurrentUser

router = APIRouter(prefix="/runs", tags=["runs"])

# TODO(phase-2): replace with real run events pulled from the run event store /
# LangGraph execution stream.
_MOCK_STEPS = [
    "Understanding your goal",
    "Selecting capabilities",
    "Building the agent",
    "Running a test",
]


def _sse(event_type: str, data: dict) -> str:
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


async def _mock_event_stream(run_id: str) -> AsyncIterator[str]:
    def now() -> str:
        return datetime.now(UTC).isoformat()

    yield _sse("run_started", {"run_id": run_id, "timestamp": now()})
    for index, label in enumerate(_MOCK_STEPS, start=1):
        await asyncio.sleep(0.3)
        yield _sse(
            "step",
            {"run_id": run_id, "step": index, "label": label, "timestamp": now()},
        )
    await asyncio.sleep(0.3)
    yield _sse("run_completed", {"run_id": run_id, "status": "succeeded", "timestamp": now()})


@router.get("/{run_id}/stream")
async def stream_run(run_id: str, user: CurrentUser) -> StreamingResponse:
    """Stream run progress as Server-Sent Events (simulated in Phase 1)."""
    return StreamingResponse(_mock_event_stream(run_id), media_type="text/event-stream")
