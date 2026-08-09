"""Audio transcription via OpenAI Whisper (platform key)."""

from __future__ import annotations

import base64
import logging
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agent_service.auth import CurrentUser
from agent_service.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["transcribe"])

_MAX_BYTES = 25 * 1024 * 1024  # Whisper limit


class TranscribeBody(BaseModel):
    audio_base64: str = Field(min_length=8, max_length=40_000_000)
    mime_type: str = Field(default="audio/webm", max_length=128)
    language: str | None = Field(default=None, max_length=16)


@router.post("/transcribe")
async def transcribe_audio(body: TranscribeBody, user: CurrentUser) -> dict[str, Any]:
    """Transcribe a short voice recording with OpenAI Whisper."""
    settings = get_settings()
    api_key = settings.OPENAI_API_KEY
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail={"code": "WHISPER_UNAVAILABLE", "message": "OpenAI key not configured."},
        )
    try:
        raw = base64.b64decode(body.audio_base64, validate=False)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_AUDIO", "message": "Invalid audio payload."},
        ) from exc
    if len(raw) > _MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail={"code": "AUDIO_TOO_LARGE", "message": "Recording is too large."},
        )
    if len(raw) < 64:
        raise HTTPException(
            status_code=400,
            detail={"code": "AUDIO_EMPTY", "message": "Recording is empty."},
        )

    suffix = _suffix_for_mime(body.mime_type)
    try:
        import httpx

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(raw)
            tmp_path = Path(tmp.name)
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                with tmp_path.open("rb") as audio_file:
                    files = {"file": (f"recording{suffix}", audio_file, body.mime_type)}
                    data: dict[str, str] = {"model": "whisper-1"}
                    if body.language:
                        data["language"] = body.language
                    response = await client.post(
                        "https://api.openai.com/v1/audio/transcriptions",
                        headers={"Authorization": f"Bearer {api_key}"},
                        files=files,
                        data=data,
                    )
        finally:
            tmp_path.unlink(missing_ok=True)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.warning("whisper request failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=502,
            detail={"code": "WHISPER_FAILED", "message": "Transcription failed."},
        ) from exc

    if response.status_code >= 400:
        logger.warning("whisper HTTP %s: %s", response.status_code, response.text[:200])
        raise HTTPException(
            status_code=502,
            detail={"code": "WHISPER_FAILED", "message": "Transcription provider error."},
        )
    payload = response.json()
    text = str(payload.get("text") or "").strip()
    return {"text": text, "user_id": user.user_id}


def _suffix_for_mime(mime: str) -> str:
    mime = (mime or "").lower()
    if "mp4" in mime or "m4a" in mime:
        return ".m4a"
    if "mpeg" in mime or "mp3" in mime:
        return ".mp3"
    if "wav" in mime:
        return ".wav"
    if "ogg" in mime:
        return ".ogg"
    return ".webm"
