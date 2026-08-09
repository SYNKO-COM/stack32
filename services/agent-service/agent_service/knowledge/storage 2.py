"""Supabase Storage helpers for agent-knowledge bucket."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from agent_service.config import get_settings

logger = logging.getLogger(__name__)

BUCKET = "agent-knowledge"


def _storage_client() -> httpx.AsyncClient:
    settings = get_settings()
    return httpx.AsyncClient(
        base_url=f"{settings.SUPABASE_URL}/storage/v1",
        headers={
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        },
        timeout=60.0,
    )


def storage_object_path(*, user_id: str, agent_id: str, source_id: str, filename: str) -> str:
    safe = filename.replace("/", "_").replace("\\", "_")
    return f"{user_id}/{agent_id}/{source_id}/{safe}"


async def upload_bytes(
    *,
    path: str,
    data: bytes,
    content_type: str,
) -> None:
    async with _storage_client() as client:
        response = await client.post(
            f"/object/{BUCKET}/{path}",
            content=data,
            headers={
                "Content-Type": content_type or "application/octet-stream",
                "x-upsert": "true",
            },
        )
    if response.status_code >= 400:
        logger.warning("storage upload failed status=%s", response.status_code)
        raise RuntimeError("STORAGE_UPLOAD_FAILED")


async def download_bytes(*, path: str) -> bytes:
    async with _storage_client() as client:
        response = await client.get(f"/object/{BUCKET}/{path}")
    if response.status_code >= 400:
        raise RuntimeError("STORAGE_DOWNLOAD_FAILED")
    return response.content


async def delete_object(*, path: str) -> None:
    async with _storage_client() as client:
        await client.delete(
            f"/object/{BUCKET}",
            json={"prefixes": [path]},
        )


def source_row_storage_fields(
    *, bucket: str, path: str, content_hash: str | None = None
) -> dict[str, Any]:
    row: dict[str, Any] = {
        "storage_bucket": bucket,
        "storage_path": path,
    }
    if content_hash:
        row["content_hash"] = content_hash
    return row
