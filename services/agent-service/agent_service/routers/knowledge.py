"""Knowledge ingestion API."""

from __future__ import annotations

import uuid
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, HttpUrl

from agent_service.auth import CurrentUser
from agent_service.knowledge.ingest import validate_source_url, validate_upload
from agent_service.supabase_client import get_persistence, get_supabase_admin_client

router = APIRouter(tags=["knowledge"])


class UrlIngestRequest(BaseModel):
    url: HttpUrl
    name: str | None = None


class TextIngestRequest(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    text: str = Field(min_length=1, max_length=500_000)
    mime_type: str = "text/plain"


@router.post("/agents/{agent_id}/knowledge/urls")
async def ingest_url(agent_id: UUID, body: UrlIngestRequest, user: CurrentUser) -> dict[str, Any]:
    db = get_persistence()
    agent = await db.get_owned_agent(str(agent_id), user.user_id)
    if not agent:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Not found."})
    try:
        url = validate_source_url(str(body.url))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=400, detail={"code": "KNOWLEDGE_INGESTION_FAILED", "message": "Unsafe URL."}
        ) from exc

    source_id = str(uuid.uuid4())
    async with get_supabase_admin_client() as client:
        await client.post(
            "/knowledge_sources",
            json={
                "id": source_id,
                "user_id": user.user_id,
                "agent_id": str(agent_id),
                "source_type": "url",
                "name": body.name or url[:120],
                "source_url": url,
                "status": "uploading",
            },
        )
    run_id = str(uuid.uuid4())
    await db.create_run(
        run_id=run_id,
        user_id=user.user_id,
        agent_id=str(agent_id),
        kind="ingestion",
        thread_id=None,
        status="queued",
        input_payload={"source_id": source_id, "url": url},
    )
    await db.enqueue_run(run_id=run_id, user_id=user.user_id)
    from agent_service.queue.worker import process_run_by_id

    await process_run_by_id(run_id)
    await db.audit(
        user_id=user.user_id,
        agent_id=str(agent_id),
        action="knowledge_url",
        resource_type="knowledge_source",
        resource_id=source_id,
        result="success",
        risk_level="medium",
    )
    return {"source_id": source_id, "run_id": run_id}


@router.post("/agents/{agent_id}/knowledge/files")
async def ingest_text_file(
    agent_id: UUID, body: TextIngestRequest, user: CurrentUser
) -> dict[str, Any]:
    db = get_persistence()
    agent = await db.get_owned_agent(str(agent_id), user.user_id)
    if not agent:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Not found."})
    try:
        safe_name = validate_upload(
            filename=body.name,
            mime_type=body.mime_type,
            size_bytes=len(body.text.encode("utf-8")),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail={"code": "KNOWLEDGE_INGESTION_FAILED", "message": str(exc)}
        ) from exc

    source_id = str(uuid.uuid4())
    async with get_supabase_admin_client() as client:
        await client.post(
            "/knowledge_sources",
            json={
                "id": source_id,
                "user_id": user.user_id,
                "agent_id": str(agent_id),
                "source_type": "text",
                "name": safe_name,
                "status": "uploading",
                "mime_type": body.mime_type,
                "size_bytes": len(body.text.encode("utf-8")),
            },
        )
    run_id = str(uuid.uuid4())
    await db.create_run(
        run_id=run_id,
        user_id=user.user_id,
        agent_id=str(agent_id),
        kind="ingestion",
        thread_id=None,
        status="queued",
        input_payload={"source_id": source_id, "text": body.text},
    )
    await db.enqueue_run(run_id=run_id, user_id=user.user_id)
    from agent_service.queue.worker import process_run_by_id

    await process_run_by_id(run_id)
    return {"source_id": source_id, "run_id": run_id}


@router.get("/agents/{agent_id}/knowledge")
async def list_knowledge(agent_id: UUID, user: CurrentUser) -> dict[str, Any]:
    db = get_persistence()
    agent = await db.get_owned_agent(str(agent_id), user.user_id)
    if not agent:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Not found."})
    rows = await db._select(
        "knowledge_sources",
        {
            "agent_id": f"eq.{agent_id}",
            "user_id": f"eq.{user.user_id}",
            "select": "id,name,source_type,status,error_message,created_at",
            "order": "created_at.desc",
        },
    )
    return {"sources": rows}


@router.delete("/agents/{agent_id}/knowledge/{source_id}")
async def delete_knowledge(
    agent_id: UUID, source_id: UUID, user: CurrentUser
) -> dict[str, Any]:
    async with get_supabase_admin_client() as client:
        response = await client.delete(
            "/knowledge_sources",
            params={
                "id": f"eq.{source_id}",
                "agent_id": f"eq.{agent_id}",
                "user_id": f"eq.{user.user_id}",
            },
        )
    return {"deleted": response.status_code < 400}


@router.post("/knowledge/{source_id}/retry")
async def retry_ingest(source_id: UUID, user: CurrentUser) -> dict[str, Any]:
    db = get_persistence()
    rows = await db._select(
        "knowledge_sources",
        {
            "id": f"eq.{source_id}",
            "user_id": f"eq.{user.user_id}",
            "select": "*",
            "limit": "1",
        },
    )
    if not rows:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Not found."})
    source = rows[0]
    run_id = str(uuid.uuid4())
    payload: dict[str, Any] = {"source_id": str(source_id)}
    if source.get("source_url"):
        payload["url"] = source["source_url"]
    await db.create_run(
        run_id=run_id,
        user_id=user.user_id,
        agent_id=source["agent_id"],
        kind="ingestion",
        thread_id=None,
        status="queued",
        input_payload=payload,
    )
    await db.enqueue_run(run_id=run_id, user_id=user.user_id)
    from agent_service.queue.worker import process_run_by_id

    await process_run_by_id(run_id)
    return {"run_id": run_id}


@router.post("/knowledge/sources/{source_id}/ingest")
async def ingest_source_legacy(source_id: str, user: CurrentUser) -> dict[str, Any]:
    return await retry_ingest(UUID(source_id), user)
