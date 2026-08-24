"""Persist and resolve encrypted user secrets (BYOK)."""

from __future__ import annotations

import logging
from typing import Any

from agent_service.security.secrets_crypto import (
    SecretsCryptoError,
    decrypt_secret,
    encrypt_secret,
    secret_hint,
)
from agent_service.supabase_client import get_supabase_admin_client

logger = logging.getLogger(__name__)

PROVIDER_ENV_PREFIX = {
    "openai": "OPENAI_API_KEY",
    "xai": "XAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "google": "GEMINI_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "mistral": "MISTRAL_API_KEY",
    "groq": "GROQ_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
}

LLM_PROVIDER_OPTIONS = [
    "openai",
    "anthropic",
    "xai",
    "mistral",
]


async def list_secret_meta(*, user_id: str, agent_id: str | None = None) -> list[dict[str, Any]]:
    params: dict[str, str] = {
        "user_id": f"eq.{user_id}",
        "select": "id,agent_id,provider,secret_kind,key_hint,label,created_at,updated_at",
        "order": "updated_at.desc",
    }
    if agent_id:
        params["or"] = f"(agent_id.eq.{agent_id},agent_id.is.null)"
    async with get_supabase_admin_client() as client:
        response = await client.get("/user_secrets", params=params)
    if response.status_code >= 400:
        return []
    return response.json() if isinstance(response.json(), list) else []


async def resolve_llm_credentials(
    *,
    user_id: str,
    agent_id: str,
    installation_id: str | None = None,
    allow_legacy_owner_fallback: bool = True,
    preferred_provider: str | None = None,
) -> tuple[str, str] | None:
    """Return (provider, api_key).

    Prefer Pipedream Connect LLM accounts (no Stack32-stored keys). Fall back to
    legacy encrypted user_secrets for agents that still have BYOK keys.

    Never falls back to Stack32 platform keys.
    """
    # 1) Pipedream Connect — user connected OpenAI/Anthropic/… via Connect UI.
    try:
        from agent_service.integrations.pipedream.llm import (
            resolve_pipedream_llm_credentials,
        )

        pd_creds = await resolve_pipedream_llm_credentials(
            user_id=user_id,
            provider=preferred_provider,
        )
        if pd_creds:
            return pd_creds
    except Exception:  # noqa: BLE001
        logger.exception("resolve_pipedream_llm_credentials_failed")

    async with get_supabase_admin_client() as client:
        if installation_id:
            response = await client.get(
                "/user_secrets",
                params={
                    "user_id": f"eq.{user_id}",
                    "secret_kind": "eq.llm_api_key",
                    "installation_id": f"eq.{installation_id}",
                    "select": "id,agent_id,installation_id,provider,ciphertext,updated_at",
                    "order": "updated_at.desc",
                    "limit": "5",
                },
            )
            if response.status_code < 400:
                rows = response.json() if isinstance(response.json(), list) else []
                if rows:
                    chosen = rows[0]
                    try:
                        key = decrypt_secret(chosen["ciphertext"])
                    except SecretsCryptoError:
                        return None
                    return str(chosen["provider"]), key

        # Legacy owner agent-scoped secret (transition only).
        if allow_legacy_owner_fallback:
            response = await client.get(
                "/user_secrets",
                params={
                    "user_id": f"eq.{user_id}",
                    "secret_kind": "eq.llm_api_key",
                    "agent_id": f"eq.{agent_id}",
                    "select": "id,agent_id,installation_id,provider,ciphertext,updated_at",
                    "order": "updated_at.desc",
                    "limit": "5",
                },
            )
            if response.status_code >= 400:
                return None
            rows = response.json() if isinstance(response.json(), list) else []
            chosen = None
            for row in rows:
                if row.get("agent_id") == agent_id:
                    chosen = row
                    break
            if chosen:
                from agent_service.installations.service import log_legacy_fallback

                log_legacy_fallback(
                    resource="user_secrets", agent_id=agent_id, user_id=user_id
                )
                try:
                    key = decrypt_secret(chosen["ciphertext"])
                except SecretsCryptoError:
                    return None
                return str(chosen["provider"]), key
    return None


async def has_llm_secret(
    *,
    user_id: str,
    agent_id: str,
    installation_id: str | None = None,
    preferred_provider: str | None = None,
) -> bool:
    creds = await resolve_llm_credentials(
        user_id=user_id,
        agent_id=agent_id,
        installation_id=installation_id,
        allow_legacy_owner_fallback=True,
        preferred_provider=preferred_provider,
    )
    return creds is not None


async def validate_llm_api_key(*, provider: str, api_key: str) -> None:
    """Minimal provider ping before encrypt. Raises ValueError on invalid key."""
    provider = provider.lower().strip()
    key = (api_key or "").strip()
    if len(key) < 8:
        raise ValueError("INVALID_LLM_KEY")
    from agent_service.config import get_settings

    settings = get_settings()
    if settings.AI_EXECUTION_MODE == "mock":
        if key.lower() in {"invalid", "bad-key", "fail"}:
            raise ValueError("INVALID_LLM_KEY")
        return
    if settings.AI_EXECUTION_MODE == "disabled":
        return

    # Cheap probe via LiteLLM — one tiny completion (or models.list when available).
    try:
        import litellm

        model_map = {
            "openai": "openai/gpt-4.1-nano",
            "anthropic": "anthropic/claude-3-5-haiku-latest",
            "google": "gemini/gemini-2.0-flash",
            "gemini": "gemini/gemini-2.0-flash",
            "xai": "xai/grok-3-mini",
            "mistral": "mistral/mistral-small-latest",
            "groq": "groq/llama-3.1-8b-instant",
            "openrouter": "openrouter/openai/gpt-4o-mini",
        }
        model = model_map.get(provider, f"{provider}/probe")
        await litellm.acompletion(
            model=model,
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=1,
            api_key=key,
            timeout=15,
        )
    except Exception as exc:  # noqa: BLE001
        logger.info("llm key probe failed provider=%s err=%s", provider, type(exc).__name__)
        raise ValueError("INVALID_LLM_KEY") from exc


async def upsert_llm_secret(
    *,
    user_id: str,
    agent_id: str | None,
    provider: str,
    api_key: str,
    label: str | None = None,
    installation_id: str | None = None,
) -> dict[str, Any]:
    provider = provider.lower().strip()
    if provider not in PROVIDER_ENV_PREFIX and provider != "custom":
        raise ValueError("Unsupported provider")
    await validate_llm_api_key(provider=provider, api_key=api_key)
    ciphertext = encrypt_secret(api_key)
    hint = secret_hint(api_key)
    payload = {
        "user_id": user_id,
        "agent_id": agent_id,
        "installation_id": installation_id,
        "provider": provider,
        "secret_kind": "llm_api_key",
        "ciphertext": ciphertext,
        "key_hint": hint,
        "label": label or f"{provider} API key",
    }
    async with get_supabase_admin_client() as client:
        # Delete existing for same scope then insert (simpler than upsert on partial unique)
        params: dict[str, str] = {
            "user_id": f"eq.{user_id}",
            "provider": f"eq.{provider}",
            "secret_kind": "eq.llm_api_key",
        }
        if installation_id:
            params["installation_id"] = f"eq.{installation_id}"
        elif agent_id:
            params["agent_id"] = f"eq.{agent_id}"
            params["installation_id"] = "is.null"
        else:
            params["agent_id"] = "is.null"
            params["installation_id"] = "is.null"
        await client.delete("/user_secrets", params=params)
        response = await client.post(
            "/user_secrets",
            json=payload,
            headers={"Prefer": "return=representation"},
        )
    if response.status_code >= 400:
        logger.warning("secret upsert failed status=%s", response.status_code)
        raise RuntimeError("Failed to store secret")
    rows = response.json()
    row = rows[0] if rows else {}
    return {
        "id": row.get("id"),
        "provider": provider,
        "key_hint": hint,
        "label": payload["label"],
        "installation_id": installation_id,
    }


async def record_llm_validation(
    *,
    user_id: str,
    agent_id: str | None,
    provider: str,
    model_id: str,
    status: str,
    error_code: str | None = None,
    detail: str | None = None,
) -> None:
    """Persist the latest exact-model validation outcome for freshness checks."""
    payload = {
        "user_id": user_id,
        "agent_id": agent_id,
        "provider": provider.lower().strip(),
        "model_id": model_id.strip(),
        "status": status,
        "error_code": error_code,
        "detail": (detail or "")[:500] or None,
    }
    async with get_supabase_admin_client() as client:
        if agent_id:
            await client.delete(
                "/llm_validations",
                params={
                    "user_id": f"eq.{user_id}",
                    "agent_id": f"eq.{agent_id}",
                    "provider": f"eq.{payload['provider']}",
                    "model_id": f"eq.{payload['model_id']}",
                },
            )
        response = await client.post("/llm_validations", json=payload)
    if response.status_code >= 400:
        logger.info("llm_validation record failed status=%s", response.status_code)


async def latest_model_config_across_agents(*, user_id: str) -> dict[str, Any] | None:
    """The model this user already runs on another agent, newest first.

    A new agent's spec leaves `model` empty, and the BYOK restore below only
    fires when this very agent once validated a pasted key. In the Pipedream
    world the OpenAI account lives at account level, so every new agent asked
    the person to re-pick the model they had already chosen — the brain check
    failed on a fresh build even though their other agents ran fine.
    """
    async with get_supabase_admin_client() as client:
        agents = await client.get(
            "/agents",
            params={
                "user_id": f"eq.{user_id}",
                "deleted_at": "is.null",
                "select": "id",
                "order": "updated_at.desc",
                "limit": "10",
            },
        )
        if agents.status_code >= 400:
            return None
        rows = agents.json() if isinstance(agents.json(), list) else []
        ids = ",".join(str(r.get("id")) for r in rows if r.get("id"))
        if not ids:
            return None
        versions = await client.get(
            "/agent_versions",
            params={
                "agent_id": f"in.({ids})",
                "select": "spec,created_at",
                "order": "created_at.desc",
                "limit": "30",
            },
        )
        if versions.status_code >= 400:
            return None
        for row in versions.json() if isinstance(versions.json(), list) else []:
            spec = row.get("spec") if isinstance(row.get("spec"), dict) else {}
            model = spec.get("model") if isinstance(spec.get("model"), dict) else None
            if model and model.get("provider") and model.get("model_id"):
                return dict(model)
    return None


async def latest_valid_model_config(
    *, user_id: str, agent_id: str
) -> dict[str, Any] | None:
    """Latest valid BYOK model for this user+agent — never another user's session."""
    async with get_supabase_admin_client() as client:
        response = await client.get(
            "/llm_validations",
            params={
                "user_id": f"eq.{user_id}",
                "agent_id": f"eq.{agent_id}",
                "status": "eq.valid",
                "select": "provider,model_id,checked_at",
                "order": "checked_at.desc",
                "limit": "1",
            },
        )
    if response.status_code >= 400:
        return None
    rows = response.json()
    if not isinstance(rows, list) or not rows:
        return None
    provider = str(rows[0].get("provider") or "").strip().lower()
    model_id = str(rows[0].get("model_id") or "").strip()
    if not provider or not model_id:
        return None
    secrets = await list_secret_meta(user_id=user_id, agent_id=agent_id)
    has_key = any(
        str(row.get("provider") or "").lower() == provider
        and str(row.get("secret_kind") or "") in {"", "llm_api_key"}
        for row in secrets
    )
    if not has_key:
        return None
    return {
        "provider": provider,
        "model_id": model_id,
        "credential_scope": "agent",
        "fallback_enabled": False,
    }


async def latest_llm_validation(
    *, user_id: str, agent_id: str, provider: str, model_id: str
) -> str | None:
    """Return the last recorded validation status for this exact model, if any."""
    async with get_supabase_admin_client() as client:
        response = await client.get(
            "/llm_validations",
            params={
                "user_id": f"eq.{user_id}",
                "agent_id": f"eq.{agent_id}",
                "provider": f"eq.{provider.lower().strip()}",
                "model_id": f"eq.{model_id.strip()}",
                "select": "status,checked_at",
                "order": "checked_at.desc",
                "limit": "1",
            },
        )
    if response.status_code >= 400:
        return None
    rows = response.json()
    if isinstance(rows, list) and rows:
        return str(rows[0].get("status") or "") or None
    return None


async def validate_agent_model(
    *, user_id: str, agent_id: str | None, provider: str, model_id: str, api_key: str
) -> Any:
    """Validate an exact provider/model with the given key and record the outcome."""
    from agent_service.gateway.llm_validation import validate_model

    result = await validate_model(provider=provider, model_id=model_id, api_key=api_key)
    await record_llm_validation(
        user_id=user_id,
        agent_id=agent_id,
        provider=provider,
        model_id=model_id,
        status=result.status,
        error_code=result.error_code,
        detail=result.detail,
    )
    return result
