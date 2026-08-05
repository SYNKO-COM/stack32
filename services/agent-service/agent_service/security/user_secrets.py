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
    "google",
    "xai",
    "mistral",
    "groq",
    "openrouter",
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


async def has_llm_secret(*, user_id: str, agent_id: str) -> bool:
    rows = await list_secret_meta(user_id=user_id, agent_id=agent_id)
    return any(r.get("secret_kind") == "llm_api_key" for r in rows)


async def upsert_llm_secret(
    *,
    user_id: str,
    agent_id: str | None,
    provider: str,
    api_key: str,
    label: str | None = None,
) -> dict[str, Any]:
    provider = provider.lower().strip()
    if provider not in PROVIDER_ENV_PREFIX and provider != "custom":
        raise ValueError("Unsupported provider")
    ciphertext = encrypt_secret(api_key)
    hint = secret_hint(api_key)
    payload = {
        "user_id": user_id,
        "agent_id": agent_id,
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
        if agent_id:
            params["agent_id"] = f"eq.{agent_id}"
        else:
            params["agent_id"] = "is.null"
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
    }


async def resolve_llm_credentials(
    *, user_id: str, agent_id: str
) -> tuple[str, str] | None:
    """Return (provider, api_key) preferring agent-scoped then user default."""
    async with get_supabase_admin_client() as client:
        response = await client.get(
            "/user_secrets",
            params={
                "user_id": f"eq.{user_id}",
                "secret_kind": "eq.llm_api_key",
                "or": f"(agent_id.eq.{agent_id},agent_id.is.null)",
                "select": "id,agent_id,provider,ciphertext,updated_at",
                "order": "agent_id.nullslast,updated_at.desc",
            },
        )
    if response.status_code >= 400:
        return None
    rows = response.json() if isinstance(response.json(), list) else []
    # Prefer agent-specific
    chosen = None
    for row in rows:
        if row.get("agent_id") == agent_id:
            chosen = row
            break
    if chosen is None and rows:
        chosen = rows[0]
    if not chosen:
        return None
    try:
        key = decrypt_secret(chosen["ciphertext"])
    except SecretsCryptoError:
        return None
    return str(chosen["provider"]), key
