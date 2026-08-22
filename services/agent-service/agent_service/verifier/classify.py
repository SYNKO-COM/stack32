"""Failure classification for the unified verifier/self-repair loop (M7).

Every verification failure is normalized into one of three actionable categories
so the repair loop knows what to do:

- ``BUILDER_REPAIRABLE``  → Stack32 can attempt an automated code/spec fix.
- ``USER_ACTION_REQUIRED`` → needs the user (connect an account, fix a key, pick a
  model, provide a required setting) — never auto-repairable.
- ``PROVIDER_TEMPORARY``  → transient upstream issue (rate limit, 5xx, timeout);
  worth a bounded retry but not a code change.

Anything unrecognized is treated as ``BUILDER_REPAIRABLE`` (best-effort repair)
unless it clearly looks user- or provider-owned.
"""

from __future__ import annotations

import hashlib
import re
from typing import Literal

FailureCategory = Literal[
    "BUILDER_REPAIRABLE",
    "USER_ACTION_REQUIRED",
    "PROVIDER_TEMPORARY",
]

# Exact/prefix error codes that require the user to act. Matched case-insensitively.
_USER_ACTION_CODES = {
    "CONNECTION_REQUIRED",
    "LLM_CONFIGURATION_REQUIRED",
    "LLM_CONFIG_REQUIRED",
    "INVALID_LLM_KEY",
    "INVALID_AUTH",
    "INVALID_API_KEY",
    "MODEL_NOT_FOUND",
    "MODEL_ACCESS_DENIED",
    "INSUFFICIENT_QUOTA",
    "TOOL_CONFIG_REQUIRED",
    "TOOL_CONFIGURATION_REQUIRED",
    "MISSING_TOOL_CONFIG",
    "PIPEDREAM_NOT_CONFIGURED",
    "GOOGLE_OAUTH_NOT_CONFIGURED",
    "APPROVAL_REQUIRED",
    "APPROVAL_DENIED",
    "PERMISSION_DENIED",
}

# Codes/signatures that are transient and worth a bounded retry, not a code fix.
_PROVIDER_TEMPORARY_CODES = {
    "MODEL_PROVIDER_UNAVAILABLE",
    "PROVIDER_TEMPORARY",
    "PROVIDER_UNAVAILABLE",
    "PIPEDREAM_UNAVAILABLE",
    "RATE_LIMIT",
    "RATE_LIMITED",
    "TIMEOUT",
    "PROVIDER_TIMEOUT",
    "SERVICE_UNAVAILABLE",
    "UPSTREAM_ERROR",
    "OVERLOADED",
}

_TEMPORARY_HTTP_STATUSES = {408, 425, 429, 500, 502, 503, 504}


def classify_failure(
    error_code: str | None,
    *,
    status: int | None = None,
    detail: str | None = None,
) -> FailureCategory:
    """Map a raw error code (+ optional HTTP status/detail) to a category."""
    code = (error_code or "").strip().upper()
    text = f"{code} {detail or ''}".upper()

    if code in _USER_ACTION_CODES:
        return "USER_ACTION_REQUIRED"
    if code in _PROVIDER_TEMPORARY_CODES:
        return "PROVIDER_TEMPORARY"

    if status is not None:
        if status in _TEMPORARY_HTTP_STATUSES:
            return "PROVIDER_TEMPORARY"
        if status in (401, 403):
            return "USER_ACTION_REQUIRED"

    # Heuristic substring fallbacks for un-enumerated messages.
    if any(k in text for k in ("RATE LIMIT", "TIMED OUT", "TEMPORARILY", "OVERLOADED")):
        return "PROVIDER_TEMPORARY"
    if any(
        k in text
        for k in (
            "CONNECT AN ACCOUNT",
            "NOT CONFIGURED",
            "MISSING KEY",
            "INVALID KEY",
            "UNAUTHORIZED",
            "FORBIDDEN",
        )
    ):
        return "USER_ACTION_REQUIRED"

    # Default: assume Stack32 can attempt an automated repair (tests/lint/schema).
    return "BUILDER_REPAIRABLE"


def failure_fingerprint(
    error_code: str | None,
    *,
    signature: str | None = None,
    file: str | None = None,
) -> str:
    """Stable fingerprint for early-stop detection across repair iterations.

    Combines the normalized error code, a failure signature (e.g. first failing
    assertion / traceback head), and the primary file so two structurally
    identical failures produce the same fingerprint even if line numbers move.
    """
    parts = [
        (error_code or "").strip().upper(),
        (signature or "").strip()[:400],
        (file or "").strip(),
    ]
    joined = "\u241f".join(parts)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:16]


def verification_progress_score(
    test_stdout: str | None = None,
    lint_stdout: str | None = None,
) -> tuple[int, int]:
    """Return ``(failing_tests, lint_errors)`` parsed from tool output.

    Used by the repair loop to decide whether an iteration actually moved
    forward. Comparing failure *fingerprints* is not enough: a suite keeps
    reporting the same summary line while the agent fixes 3 of 4 bugs, so
    fingerprint equality wrongly reads as "no progress" and aborts the loop.
    Counts shrink as the agent makes real progress.

    Unparseable output yields ``(-1, -1)``, which never compares as progress.
    """
    tests = -1
    lints = -1
    if test_stdout:
        m = re.search(r"(\d+)\s+failed", test_stdout)
        if m:
            tests = int(m.group(1))
        elif re.search(r"\d+\s+passed", test_stdout) and "error" not in test_stdout.lower():
            tests = 0
    if lint_stdout is not None:
        m = re.search(r"Found\s+(\d+)\s+error", lint_stdout)
        if m:
            lints = int(m.group(1))
        elif "All checks passed" in lint_stdout:
            lints = 0
    return tests, lints


def made_forward_progress(
    previous: tuple[int, int] | None,
    current: tuple[int, int],
) -> bool:
    """True when at least one failure count strictly decreased."""
    if previous is None:
        return False
    if any(v < 0 for v in previous) or any(v < 0 for v in current):
        return False
    return current[0] < previous[0] or current[1] < previous[1]
