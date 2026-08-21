"""Internal and public webhooks."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request

from agent_service.auth import InternalService

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/internal/ping")
async def internal_ping(_: InternalService) -> dict[str, str]:
    """Connectivity check for trusted internal callers (Next.js server)."""
    return {"status": "ok"}


@router.post("/whop")
async def whop_webhook(_: InternalService) -> None:
    raise HTTPException(
        status_code=501,
        detail={
            "code": "not_implemented",
            "message": "Webhook processing is not implemented in the agent service.",
        },
    )


@router.post("/pipedream/{trigger_id}")
async def pipedream_trigger_webhook(trigger_id: UUID, request: Request) -> dict[str, Any]:
    """Public Pipedream Connect trigger delivery. Auth = x-pd-signature."""
    raw = await request.body()
    signature = request.headers.get("x-pd-signature")
    payload: Any
    try:
        payload = json.loads(raw.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError):
        payload = {}

    from agent_service.supabase_client import get_persistence, get_supabase_admin_client
    from agent_service.triggers.service import ingest_pipedream_event

    db = get_persistence()
    async with get_supabase_admin_client() as client:
        result = await ingest_pipedream_event(
            trigger_id=str(trigger_id),
            raw_body=raw,
            signature_header=signature,
            payload=payload,
            db=db,
            client=client,
        )
    code = str(result.get("code") or "")
    if not result.get("accepted") and code in {"INVALID_SIGNATURE", "SIGNATURE_EXPIRED"}:
        raise HTTPException(
            status_code=401, detail={"code": code, "message": "Invalid signature."}
        )
    if not result.get("accepted") and code == "not_found":
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    return result
