"""Helpers for vision / multimodal user messages (OpenAI-compatible)."""

from __future__ import annotations

from typing import Any


def build_user_message_content(
    text: str,
    images: list[dict[str, Any]] | None = None,
) -> str | list[dict[str, Any]]:
    """Build chat `content` as plain text or multimodal parts.

    Image dicts accept snake_case or camelCase keys from the web client:
    ``mime_type`` / ``mimeType``, ``data_base64`` / ``dataBase64``.
    """
    prompt = (text or "").strip()
    imgs = images or []
    if not imgs:
        return prompt

    parts: list[dict[str, Any]] = []
    if prompt:
        parts.append({"type": "text", "text": prompt})

    for img in imgs:
        if not isinstance(img, dict):
            continue
        mime = str(
            img.get("mime_type") or img.get("mimeType") or "image/jpeg"
        ).strip() or "image/jpeg"
        if not mime.startswith("image/"):
            mime = "image/jpeg"
        b64 = str(img.get("data_base64") or img.get("dataBase64") or "").strip()
        if not b64:
            continue
        # Strip accidental data-URL prefix if the client sent one.
        if b64.startswith("data:"):
            comma = b64.find(",")
            if comma >= 0:
                b64 = b64[comma + 1 :]
        parts.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{b64}"},
            }
        )

    if not parts:
        return prompt
    if len(parts) == 1 and parts[0].get("type") == "text":
        return str(parts[0].get("text") or prompt)
    return parts


def text_from_user_content(content: str | list[dict[str, Any]] | None) -> str:
    """Extract plain text from a user content value (for memory / retrieval)."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    bits: list[str] = []
    for part in content:
        if isinstance(part, dict) and part.get("type") == "text":
            bits.append(str(part.get("text") or ""))
    return "\n".join(bits).strip()
