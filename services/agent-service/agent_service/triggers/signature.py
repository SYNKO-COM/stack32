"""HMAC-SHA256 validation for Pipedream Connect trigger webhooks."""

from __future__ import annotations

import hashlib
import hmac
import time

MAX_SIGNATURE_AGE_SECONDS = 300


class WebhookSignatureError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def parse_pd_signature(header: str) -> tuple[str, str]:
    """Parse ``t=<unix>,v1=<hex>`` (order of parts is not guaranteed)."""
    timestamp = ""
    digest = ""
    for part in (header or "").split(","):
        key, _, value = part.strip().partition("=")
        if key == "t":
            timestamp = value.strip()
        elif key == "v1":
            digest = value.strip()
    if not timestamp or not digest:
        raise WebhookSignatureError("INVALID_SIGNATURE")
    return timestamp, digest


def verify_webhook_signature(
    *,
    signing_key: str,
    signature_header: str,
    raw_body: bytes | str,
    now: int | None = None,
    max_age_seconds: int = MAX_SIGNATURE_AGE_SECONDS,
) -> None:
    timestamp, received = parse_pd_signature(signature_header)
    try:
        ts = int(timestamp)
    except ValueError as exc:
        raise WebhookSignatureError("INVALID_SIGNATURE") from exc
    current = int(now if now is not None else time.time())
    if abs(current - ts) > max_age_seconds:
        raise WebhookSignatureError("SIGNATURE_EXPIRED")

    body = raw_body if isinstance(raw_body, bytes) else raw_body.encode("utf-8")
    signed = timestamp.encode("utf-8") + b"." + body
    expected = hmac.new(
        signing_key.encode("utf-8"),
        signed,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, received):
        raise WebhookSignatureError("INVALID_SIGNATURE")
