"""Normalized LLM validation + error taxonomy (M4).

Replaces the previous catch-all ``INVALID_LLM_KEY`` with a granular taxonomy so the
UI can tell a user *why* their BYOK setup failed (wrong key vs wrong model vs quota
vs transient provider error) and so readiness can require a fresh *valid* result.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

LLMValidationStatus = Literal[
    "valid",
    "invalid_auth",
    "model_not_found",
    "insufficient_quota",
    "rate_limited",
    "provider_error",
    "network_error",
    "unknown",
]

# provider -> LiteLLM route prefix for building an exact "provider/model_id" string.
PROVIDER_ROUTE_PREFIX: dict[str, str] = {
    "openai": "openai",
    "anthropic": "anthropic",
    "google": "gemini",
    "gemini": "gemini",
    "xai": "xai",
    "mistral": "mistral",
    "groq": "groq",
    "openrouter": "openrouter",
}


@dataclass(frozen=True)
class LLMValidationResult:
    status: LLMValidationStatus
    error_code: str | None = None
    detail: str | None = None

    @property
    def ok(self) -> bool:
        return self.status == "valid"


def _detail(exc: BaseException) -> str:
    return f"{type(exc).__name__}: {str(exc)[:200]}"


def _status_code(exc: BaseException) -> int | None:
    for attr in ("status_code", "code", "http_status"):
        raw = getattr(exc, attr, None)
        try:
            if raw is not None:
                return int(raw)
        except (TypeError, ValueError):
            continue
    return None


def classify_llm_error(exc: BaseException) -> LLMValidationResult:
    """Map a provider/LiteLLM exception onto the normalized taxonomy (pure)."""
    name = type(exc).__name__.lower()
    msg = str(exc).lower()
    status_code = _status_code(exc)

    if (
        status_code in (401, 403)
        or "authenticationerror" in name
        or "permissiondenied" in name
        or any(
            k in msg
            for k in (
                "invalid api key",
                "incorrect api key",
                "invalid_api_key",
                "unauthorized",
                "authentication",
                "no auth credentials",
            )
        )
    ):
        return LLMValidationResult("invalid_auth", "INVALID_AUTH", _detail(exc))

    if (
        status_code == 404
        or "notfounderror" in name
        or any(
            k in msg
            for k in (
                "model not found",
                "does not exist",
                "no such model",
                "model_not_found",
                "unknown model",
                "the model",  # e.g. "the model `x` does not exist"
            )
        )
        and "quota" not in msg
    ):
        return LLMValidationResult("model_not_found", "MODEL_NOT_FOUND", _detail(exc))

    if (
        "insufficient_quota" in msg
        or "exceeded your current quota" in msg
        or "insufficientquota" in name
        or "billing" in msg
    ):
        return LLMValidationResult("insufficient_quota", "INSUFFICIENT_QUOTA", _detail(exc))

    if (
        status_code == 429
        or "ratelimit" in name
        or "rate limit" in msg
        or "too many requests" in msg
    ):
        return LLMValidationResult("rate_limited", "RATE_LIMITED", _detail(exc))

    if any(k in name for k in ("timeout", "apiconnection", "connectionerror")) or any(
        k in msg for k in ("timed out", "timeout", "connection error", "network")
    ):
        return LLMValidationResult("network_error", "NETWORK_ERROR", _detail(exc))

    if status_code is not None and status_code >= 500:
        return LLMValidationResult("provider_error", "PROVIDER_ERROR", _detail(exc))

    return LLMValidationResult("unknown", "UNKNOWN", _detail(exc))


def exact_model_route(provider: str, model_id: str) -> str:
    """Build the LiteLLM route string for an exact provider/model pair."""
    prefix = PROVIDER_ROUTE_PREFIX.get((provider or "").lower().strip(), (provider or "").lower())
    model = (model_id or "").strip()
    # openrouter models already carry a vendor prefix (e.g. "openai/gpt-4o-mini").
    if prefix == "openrouter":
        return f"openrouter/{model}"
    if model.startswith(f"{prefix}/"):
        return model
    return f"{prefix}/{model}"


async def validate_model(
    *, provider: str, model_id: str, api_key: str
) -> LLMValidationResult:
    """Validate that an *exact* model is reachable with the given key.

    Mock/disabled execution modes short-circuit so tests and offline dev never call
    a real provider. Any live failure is classified via ``classify_llm_error``.
    """
    provider = (provider or "").lower().strip()
    key = (api_key or "").strip()
    if not provider:
        return LLMValidationResult("invalid_auth", "INVALID_AUTH", "missing provider")
    if not model_id or not model_id.strip():
        return LLMValidationResult("model_not_found", "MODEL_NOT_FOUND", "missing model_id")
    if len(key) < 8:
        return LLMValidationResult("invalid_auth", "INVALID_AUTH", "key too short")

    from agent_service.config import get_settings

    settings = get_settings()
    if settings.AI_EXECUTION_MODE == "mock":
        if key.lower() in {"invalid", "bad-key", "fail"}:
            return LLMValidationResult("invalid_auth", "INVALID_AUTH", "mock invalid key")
        if model_id.lower() in {"no-such-model", "missing-model"}:
            return LLMValidationResult("model_not_found", "MODEL_NOT_FOUND", "mock missing model")
        return LLMValidationResult("valid")
    if settings.AI_EXECUTION_MODE == "disabled":
        return LLMValidationResult("valid")

    try:
        import litellm

        await litellm.acompletion(
            model=exact_model_route(provider, model_id),
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=1,
            api_key=key,
            timeout=15,
        )
    except Exception as exc:  # noqa: BLE001
        return classify_llm_error(exc)
    return LLMValidationResult("valid")
