"""Secret redaction helpers for logs and run events."""

from __future__ import annotations

import re
from typing import Any

_SECRET_PATTERNS = [
    re.compile(r"(?i)(api[_-]?key|authorization|bearer|secret|token|password)\s*[:=]\s*\S+"),
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"xai-[A-Za-z0-9]{20,}"),
    re.compile(r"sb_secret_[A-Za-z0-9]+"),
    re.compile(r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"),
]


def redact_text(value: str, replacement: str = "[REDACTED]") -> str:
    out = value
    for pattern in _SECRET_PATTERNS:
        out = pattern.sub(replacement, out)
    return out


# Keys that hold raw image bytes / data-URLs — must not run secret regexes
# (base64 blobs frequently contain substrings that look like JWTs or API keys).
_SKIP_REDACT_KEYS = frozenset(
    {
        "data_base64",
        "dataBase64",
        "image_url",
    }
)


def redact_obj(value: Any) -> Any:
    if isinstance(value, str):
        # Preserve multimodal data-URLs intact.
        if value.startswith("data:image"):
            return value
        return redact_text(value)
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for k, v in value.items():
            if k in _SKIP_REDACT_KEYS:
                out[k] = v
            elif k == "url" and isinstance(v, str) and v.startswith("data:"):
                out[k] = v
            else:
                out[k] = redact_obj(v)
        return out
    if isinstance(value, list):
        return [redact_obj(v) for v in value]
    return value
