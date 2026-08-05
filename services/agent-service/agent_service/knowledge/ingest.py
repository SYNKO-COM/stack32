"""Queued knowledge ingestion pipeline."""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Any
from urllib.parse import urlparse

from agent_service.gateway.model_gateway import get_model_gateway
from agent_service.knowledge.extract import ExtractionError, extract_text
from agent_service.knowledge.storage import (
    BUCKET,
    download_bytes,
    source_row_storage_fields,
    storage_object_path,
    upload_bytes,
)
from agent_service.security.ssrf import UnsafeURLError, validate_public_http_url
from agent_service.supabase_client import get_supabase_admin_client

logger = logging.getLogger(__name__)

ALLOWED_MIME = frozenset(
    {
        "application/pdf",
        "text/plain",
        "text/markdown",
        "text/csv",
        "application/csv",
    }
)
ALLOWED_EXT = frozenset({".pdf", ".txt", ".md", ".csv", ".markdown"})
MAX_FILE_BYTES = 10 * 1024 * 1024


def sanitize_filename(name: str) -> str:
    base = name.split("/")[-1].split("\\")[-1]
    base = re.sub(r"[^A-Za-z0-9._\- ]+", "_", base)
    return base[:180] or "document.txt"


async def mark_source_status(
    source_id: str,
    user_id: str,
    status: str,
    error: str | None = None,
    *,
    extra: dict[str, Any] | None = None,
) -> None:
    payload: dict[str, Any] = {"status": status}
    if error:
        payload["error_message"] = error[:500]
        payload["extraction_status"] = error[:120]
    elif status == "ready":
        payload["extraction_status"] = "ok"
    if extra:
        payload.update(extra)
    async with get_supabase_admin_client() as client:
        await client.patch(
            "/knowledge_sources",
            params={"id": f"eq.{source_id}", "user_id": f"eq.{user_id}"},
            json=payload,
        )


async def ingest_text_source(
    *,
    user_id: str,
    agent_id: str,
    source_id: str,
    text: str,
) -> None:
    await mark_source_status(source_id, user_id, "processing")
    try:
        chunks = _split_text(text)
        gateway = get_model_gateway()
        embeddings = await gateway.embed(chunks) if chunks else []
        rows = []
        for idx, (chunk, emb) in enumerate(zip(chunks, embeddings, strict=False)):
            rows.append(
                {
                    "source_id": source_id,
                    "user_id": user_id,
                    "agent_id": agent_id,
                    "content": chunk,
                    "chunk_index": idx,
                    "embedding": emb,
                    "embedding_model": "configured",
                    "embedding_dimension": 1536,
                    "token_count": max(1, len(chunk) // 4),
                }
            )
        if rows:
            async with get_supabase_admin_client() as client:
                response = await client.post("/knowledge_chunks", json=rows)
                if response.status_code >= 400:
                    raise RuntimeError("chunk insert failed")
        await mark_source_status(source_id, user_id, "ready")
    except Exception as exc:  # noqa: BLE001
        logger.warning("ingest failed source=%s err=%s", source_id, type(exc).__name__)
        await mark_source_status(source_id, user_id, "failed", "KNOWLEDGE_INGESTION_FAILED")


async def ingest_url_source(*, user_id: str, agent_id: str, source_id: str, url: str) -> None:
    await mark_source_status(source_id, user_id, "processing")
    try:
        validate_public_http_url(url)
        import httpx

        async with httpx.AsyncClient(timeout=20.0, follow_redirects=False) as client:
            response = await client.get(url)
            if response.is_redirect:
                loc = response.headers.get("location", "")
                validate_public_http_url(loc)
                response = await client.get(loc)
            if len(response.content) > MAX_FILE_BYTES:
                raise RuntimeError("too large")
            text = response.content.decode("utf-8", errors="replace")
        await ingest_text_source(
            user_id=user_id, agent_id=agent_id, source_id=source_id, text=text
        )
    except UnsafeURLError:
        await mark_source_status(source_id, user_id, "failed", "Unsafe URL")
    except Exception:  # noqa: BLE001
        await mark_source_status(source_id, user_id, "failed", "KNOWLEDGE_INGESTION_FAILED")


async def store_and_queue_file(
    *,
    user_id: str,
    agent_id: str,
    source_id: str,
    filename: str,
    mime_type: str,
    data: bytes,
) -> str:
    """Upload bytes to Storage and return the object path."""
    path = storage_object_path(
        user_id=user_id, agent_id=agent_id, source_id=source_id, filename=filename
    )
    content_hash = hashlib.sha256(data).hexdigest()
    await upload_bytes(path=path, data=data, content_type=mime_type)
    async with get_supabase_admin_client() as client:
        await client.patch(
            "/knowledge_sources",
            params={"id": f"eq.{source_id}", "user_id": f"eq.{user_id}"},
            json={
                **source_row_storage_fields(bucket=BUCKET, path=path, content_hash=content_hash),
                "status": "queued",
                "size_bytes": len(data),
                "mime_type": mime_type,
            },
        )
    return path


async def ingest_storage_source(
    *,
    user_id: str,
    agent_id: str,
    source_id: str,
    storage_path: str,
    filename: str,
    mime_type: str | None = None,
) -> None:
    """Download from Storage, extract, chunk, embed."""
    await mark_source_status(source_id, user_id, "processing", extra={"extraction_status": "running"})
    try:
        data = await download_bytes(path=storage_path)
        if len(data) > MAX_FILE_BYTES:
            raise ExtractionError("FILE_TOO_LARGE", "File exceeds size limit.")
        text, meta = extract_text(filename=filename, mime_type=mime_type, data=data)
        await mark_source_status(
            source_id,
            user_id,
            "processing",
            extra={"extraction_metadata": meta, "extraction_status": "extracted"},
        )
        await ingest_text_source(
            user_id=user_id, agent_id=agent_id, source_id=source_id, text=text
        )
    except ExtractionError as exc:
        await mark_source_status(source_id, user_id, "failed", exc.code)
    except Exception:  # noqa: BLE001
        logger.exception("storage ingest failed source=%s", source_id)
        await mark_source_status(source_id, user_id, "failed", "KNOWLEDGE_INGESTION_FAILED")


def _split_text(text: str, chunk_size: int = 1200, overlap: int = 150) -> list[str]:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if not cleaned:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(cleaned):
        end = min(len(cleaned), start + chunk_size)
        chunks.append(cleaned[start:end])
        if end >= len(cleaned):
            break
        start = max(0, end - overlap)
    return chunks[:200]


def validate_upload(*, filename: str, mime_type: str | None, size_bytes: int) -> str:
    if size_bytes > MAX_FILE_BYTES:
        raise ValueError("File too large")
    safe = sanitize_filename(filename)
    ext = "." + safe.rsplit(".", 1)[-1].lower() if "." in safe else ""
    if ext not in ALLOWED_EXT:
        raise ValueError("Extension not allowed")
    if mime_type and mime_type.split(";")[0].strip() not in ALLOWED_MIME:
        # Allow octet-stream for txt/md/csv by extension
        if ext not in {".txt", ".md", ".csv", ".markdown"}:
            raise ValueError("MIME type not allowed")
    if ".." in filename or filename.startswith("/"):
        raise ValueError("Invalid filename")
    return safe


def validate_source_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Invalid scheme")
    return validate_public_http_url(url)
