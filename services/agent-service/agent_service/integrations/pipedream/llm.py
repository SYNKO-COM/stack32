"""Resolve LLM API credentials from Pipedream Connect accounts.

Stack32 no longer asks users to paste LLM keys into the Model drawer.
Users connect OpenAI / Anthropic / … via Pipedream Connect; we pull the
account credentials at runtime for LiteLLM (tool-calling + streaming unchanged).
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# Stack32 Live LLM providers → Pipedream Connect app name_slugs.
LLM_PROVIDER_PIPEDREAM_APPS: dict[str, list[str]] = {
    "openai": ["openai"],
    "anthropic": ["anthropic"],
    # Official Pipedream name_slug is x_ai; keep "xai" as legacy alias.
    "xai": ["x_ai", "xai"],
    "mistral": ["mistral_ai", "mistral"],
}

LIVE_LLM_PROVIDERS = ("openai", "anthropic", "xai", "mistral")


def pipedream_apps_for_provider(provider: str | None) -> list[str]:
    key = (provider or "").strip().lower()
    return list(LLM_PROVIDER_PIPEDREAM_APPS.get(key) or ([key] if key else []))


def provider_for_pipedream_app(app_id: str | None) -> str | None:
    slug = (app_id or "").strip().lower().replace("-", "_")
    if not slug:
        return None
    for provider, apps in LLM_PROVIDER_PIPEDREAM_APPS.items():
        if slug in apps or slug == provider:
            return provider
    return None


def extract_api_key_from_credentials(credentials: dict[str, Any] | None) -> str | None:
    if not isinstance(credentials, dict):
        return None
    for key in (
        "api_key",
        "apiKey",
        "openai_api_key",
        "anthropic_api_key",
        "key",
        "token",
        "access_token",
        "oauth_access_token",
    ):
        value = credentials.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    # Nested auth blobs used by some PD app definitions.
    auth = credentials.get("$auth") if isinstance(credentials.get("$auth"), dict) else None
    if auth:
        return extract_api_key_from_credentials(auth)
    return None


async def resolve_pipedream_llm_credentials(
    *,
    user_id: str,
    provider: str | None = None,
    account_id: str | None = None,
) -> tuple[str, str] | None:
    """Return (provider, api_key) from a Pipedream Connect LLM account, or None."""
    from agent_service.integrations.pipedream.client import PipedreamClient

    client = PipedreamClient()
    if not client.configured():
        return None

    preferred = (provider or "").strip().lower() or None
    apps_to_try = pipedream_apps_for_provider(preferred) if preferred else []
    if not apps_to_try:
        # Scan all known LLM apps when provider is unspecified.
        seen: set[str] = set()
        for apps in LLM_PROVIDER_PIPEDREAM_APPS.values():
            for app in apps:
                if app not in seen:
                    seen.add(app)
                    apps_to_try.append(app)

    for app in apps_to_try:
        try:
            accounts = await client.list_accounts(
                external_user_id=user_id,
                app=app,
                include_credentials=True,
            )
        except Exception:  # noqa: BLE001
            logger.exception("pipedream_llm_list_accounts_failed app=%s", app)
            continue
        for account in accounts:
            if account_id and str(account.get("id")) != str(account_id):
                continue
            # Prefer healthy accounts when the flag is present.
            healthy = account.get("healthy")
            if healthy is False:
                continue
            api_key = extract_api_key_from_credentials(
                account.get("credentials") if isinstance(account.get("credentials"), dict) else None
            )
            if not api_key:
                # Credentials may be nested under raw.
                raw = account.get("raw") if isinstance(account.get("raw"), dict) else {}
                api_key = extract_api_key_from_credentials(
                    raw.get("credentials") if isinstance(raw.get("credentials"), dict) else None
                )
            if not api_key:
                continue
            resolved_provider = preferred or provider_for_pipedream_app(
                str(account.get("app_id") or app)
            ) or preferred or "openai"
            logger.info(
                "pipedream_llm_credentials_resolved provider=%s app=%s account=%s",
                resolved_provider,
                app,
                account.get("id"),
            )
            return resolved_provider, api_key
    return None


async def has_pipedream_llm_connection(
    *,
    user_id: str,
    provider: str | None = None,
) -> bool:
    """True when a Pipedream account exists for the LLM provider (no credential fetch)."""
    from agent_service.integrations.pipedream.client import PipedreamClient

    client = PipedreamClient()
    if not client.configured():
        return False
    for app in pipedream_apps_for_provider(provider) or []:
        try:
            accounts = await client.list_accounts(external_user_id=user_id, app=app)
        except Exception:  # noqa: BLE001
            continue
        for account in accounts:
            if account.get("healthy") is False:
                continue
            if account.get("id"):
                return True
    # Also accept synced Stack32 user_connections rows (faster path).
    try:
        from agent_service.connections.manager import ConnectionManager

        mgr = ConnectionManager()
        connections = await mgr.list_connections(user_id=user_id)
        wanted = set(pipedream_apps_for_provider(provider))
        for conn in connections or []:
            if not isinstance(conn, dict):
                continue
            status = str(conn.get("status") or "").lower()
            if status not in {"active", "connected", "ok"}:
                continue
            if str(conn.get("provider") or "").lower() != "pipedream":
                continue
            meta = conn.get("provider_metadata") if isinstance(conn.get("provider_metadata"), dict) else {}
            app = str(meta.get("app_id") or "").lower()
            if app in wanted or (provider and app == provider.lower()):
                return True
    except Exception:  # noqa: BLE001
        logger.debug("pipedream_llm_connection_lookup_failed", exc_info=True)
    return False
