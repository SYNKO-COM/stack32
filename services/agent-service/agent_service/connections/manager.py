"""Connection manager — OAuth PKCE, bindings, credential resolution (never to LLM)."""

from __future__ import annotations

import base64
import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx

from agent_service.config import get_settings
from agent_service.security.secrets_crypto import decrypt_secret, encrypt_secret
from agent_service.supabase_client import get_supabase_admin_client

logger = logging.getLogger(__name__)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"

GOOGLE_SCOPES = {
    "gmail": [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.compose",
    ],
    "calendar": [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
    ],
    "docs": [
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/drive.file",
    ],
    "openid": [
        "openid",
        "email",
        "profile",
    ],
}


class ConnectionError(Exception):
    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest())
        .decode("ascii")
        .rstrip("=")
    )
    return verifier, challenge


_GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly"
_GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send"
_GMAIL_COMPOSE = "https://www.googleapis.com/auth/gmail.compose"
_CAL_READONLY = "https://www.googleapis.com/auth/calendar.readonly"
_CAL_EVENTS = "https://www.googleapis.com/auth/calendar.events"
_DOCS = "https://www.googleapis.com/auth/documents"
_DRIVE_FILE = "https://www.googleapis.com/auth/drive.file"


def scopes_for_tools(tool_ids: list[str]) -> list[str]:
    """Least-privilege Google OAuth scopes for the requested tools."""
    scopes: list[str] = list(GOOGLE_SCOPES["openid"])
    for tid in tool_ids:
        if tid in {"gmail_list", "gmail_read"}:
            scopes.append(_GMAIL_READONLY)
        elif tid == "gmail_create_draft":
            scopes.append(_GMAIL_COMPOSE)
        elif tid in {"gmail_send_message", "gmail_send"}:
            scopes.append(_GMAIL_SEND)
        elif tid == "calendar_list":
            scopes.append(_CAL_READONLY)
        elif tid == "calendar_create_event":
            scopes.append(_CAL_EVENTS)
        elif tid in {"google_docs_create", "google_docs_append"} or tid.startswith("google_docs"):
            scopes.extend(GOOGLE_SCOPES["docs"])
        elif tid.startswith("gmail") or tid in {"gmail", "email", "mail"}:
            # Broad fallback for legacy / aggregate requests.
            scopes.extend(GOOGLE_SCOPES["gmail"])
        elif tid.startswith("calendar") or tid == "calendar":
            scopes.extend(GOOGLE_SCOPES["calendar"])
        elif tid in {"docs", "google_docs", "drive"}:
            scopes.extend(GOOGLE_SCOPES["docs"])
    # unique preserve order
    seen: set[str] = set()
    out: list[str] = []
    for s in scopes:
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


class ConnectionManager:
    """Google OAuth PKCE + credential vault. Tokens never returned to clients/LLM."""

    async def start_google_oauth(
        self,
        *,
        user_id: str,
        agent_id: str | None = None,
        tool_ids: list[str] | None = None,
    ) -> dict[str, str]:
        settings = get_settings()
        if not settings.GOOGLE_OAUTH_CLIENT_ID:
            raise ConnectionError("GOOGLE_OAUTH_NOT_CONFIGURED")
        verifier, challenge = _pkce_pair()
        state = secrets.token_urlsafe(32)
        scopes = scopes_for_tools(tool_ids or ["gmail", "calendar"])
        redirect_uri = settings.GOOGLE_OAUTH_REDIRECT_URI
        expires = (datetime.now(UTC) + timedelta(minutes=15)).isoformat()
        async with get_supabase_admin_client() as client:
            await client.post(
                "/oauth_connection_states",
                json={
                    "user_id": user_id,
                    "provider": "google",
                    "state": state,
                    "code_verifier": verifier,
                    "redirect_uri": redirect_uri,
                    "scopes": scopes,
                    "agent_id": agent_id,
                    "expires_at": expires,
                },
            )
        params = {
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(scopes),
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "access_type": "offline",
            "prompt": "consent",
        }
        return {"authorize_url": f"{GOOGLE_AUTH_URL}?{urlencode(params)}", "state": state}

    async def complete_google_oauth(
        self, *, user_id: str, state: str, code: str
    ) -> dict[str, Any]:
        async with get_supabase_admin_client() as client:
            response = await client.get(
                "/oauth_connection_states",
                params={
                    "state": f"eq.{state}",
                    "user_id": f"eq.{user_id}",
                    "select": "*",
                    "limit": "1",
                },
            )
            rows = response.json() if response.status_code < 400 else []
            if not rows:
                raise ConnectionError("OAUTH_STATE_INVALID")
            row = rows[0]
            if row.get("consumed_at"):
                raise ConnectionError("OAUTH_STATE_CONSUMED")
            expires = row.get("expires_at")
            if expires and datetime.fromisoformat(str(expires).replace("Z", "+00:00")) < datetime.now(
                UTC
            ):
                raise ConnectionError("OAUTH_STATE_EXPIRED")

            token = await self._exchange_code(
                code=code,
                code_verifier=row["code_verifier"],
                redirect_uri=row["redirect_uri"],
            )
            access = token.get("access_token")
            refresh = token.get("refresh_token")
            if not access:
                raise ConnectionError("OAUTH_TOKEN_EXCHANGE_FAILED")

            email = await self._fetch_google_email(access) or None
            access_ref = encrypt_secret(access)
            refresh_ref = encrypt_secret(refresh) if refresh else None
            expires_in = int(token.get("expires_in") or 3600)
            token_expires = (datetime.now(UTC) + timedelta(seconds=expires_in)).isoformat()

            conn_payload = {
                "user_id": user_id,
                "provider": "google",
                "status": "active",
                "account_email": email,
                "account_label": email or "Google",
                "scopes": row.get("scopes") or [],
                "secret_ref": access_ref,
                "refresh_secret_ref": refresh_ref,
                "token_expires_at": token_expires,
                "last_validated_at": datetime.now(UTC).isoformat(),
                "metadata": {"token_type": token.get("token_type", "Bearer")},
            }
            # Upsert-ish: delete same email+provider then insert
            if email:
                await client.delete(
                    "/user_connections",
                    params={
                        "user_id": f"eq.{user_id}",
                        "provider": "eq.google",
                        "account_email": f"eq.{email}",
                    },
                )
            inserted = await client.post(
                "/user_connections",
                json=conn_payload,
                headers={"Prefer": "return=representation"},
            )
            conn_rows = inserted.json() if inserted.status_code < 400 else []
            connection = conn_rows[0] if conn_rows else {}

            await client.patch(
                "/oauth_connection_states",
                params={"id": f"eq.{row['id']}"},
                json={"consumed_at": datetime.now(UTC).isoformat()},
            )

            agent_id = row.get("agent_id")
            if agent_id and connection.get("id"):
                await self.bind_connection(
                    user_id=user_id,
                    agent_id=agent_id,
                    connection_id=connection["id"],
                    tool_ids=[
                        "gmail_list",
                        "gmail_read",
                        "gmail_send",
                        "gmail_create_draft",
                        "gmail_send_message",
                        "calendar_list",
                        "calendar_create_event",
                        "google_docs_create",
                        "google_docs_append",
                    ],
                )

        return {
            "connection_id": connection.get("id"),
            "provider": "google",
            "account_email": email,
            "status": "active",
            "agent_id": agent_id,
            # never include tokens
        }

    async def _exchange_code(
        self, *, code: str, code_verifier: str, redirect_uri: str
    ) -> dict[str, Any]:
        settings = get_settings()
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
                    "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
                    "code": code,
                    "code_verifier": code_verifier,
                    "grant_type": "authorization_code",
                    "redirect_uri": redirect_uri,
                },
            )
        if response.status_code >= 400:
            logger.warning("google token exchange failed status=%s", response.status_code)
            raise ConnectionError("OAUTH_TOKEN_EXCHANGE_FAILED")
        return response.json()

    async def _fetch_google_email(self, access_token: str) -> str | None:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if response.status_code >= 400:
            return None
        return response.json().get("email")

    async def bind_connection(
        self,
        *,
        user_id: str,
        agent_id: str,
        connection_id: str,
        tool_ids: list[str],
    ) -> dict[str, Any]:
        async with get_supabase_admin_client() as client:
            # ownership checks
            conn = await client.get(
                "/user_connections",
                params={
                    "id": f"eq.{connection_id}",
                    "user_id": f"eq.{user_id}",
                    "select": "id,status,provider",
                    "limit": "1",
                },
            )
            conn_rows = conn.json() if conn.status_code < 400 else []
            if not conn_rows or conn_rows[0].get("status") != "active":
                raise ConnectionError("CONNECTION_NOT_ACTIVE")
            agent = await client.get(
                "/agents",
                params={
                    "id": f"eq.{agent_id}",
                    "user_id": f"eq.{user_id}",
                    "select": "id",
                    "limit": "1",
                },
            )
            if not (agent.json() if agent.status_code < 400 else []):
                raise ConnectionError("AGENT_NOT_FOUND")
            await client.delete(
                "/agent_connection_bindings",
                params={
                    "agent_id": f"eq.{agent_id}",
                    "connection_id": f"eq.{connection_id}",
                },
            )
            response = await client.post(
                "/agent_connection_bindings",
                json={
                    "user_id": user_id,
                    "agent_id": agent_id,
                    "connection_id": connection_id,
                    "tool_ids": tool_ids,
                    "enabled": True,
                },
                headers={"Prefer": "return=representation"},
            )
        rows = response.json() if response.status_code < 400 else []
        return rows[0] if rows else {}

    async def list_connections(self, *, user_id: str) -> list[dict[str, Any]]:
        async with get_supabase_admin_client() as client:
            response = await client.get(
                "/user_connections",
                params={
                    "user_id": f"eq.{user_id}",
                    "select": (
                        "id,provider,status,account_email,account_label,scopes,"
                        "token_expires_at,updated_at,external_account_id,provider_metadata"
                    ),
                    "order": "updated_at.desc",
                },
            )
        rows = response.json() if response.status_code < 400 else []
        return rows if isinstance(rows, list) else []

    async def list_bindings(self, *, user_id: str, agent_id: str) -> list[dict[str, Any]]:
        async with get_supabase_admin_client() as client:
            response = await client.get(
                "/agent_connection_bindings",
                params={
                    "user_id": f"eq.{user_id}",
                    "agent_id": f"eq.{agent_id}",
                    "select": "id,connection_id,tool_ids,enabled,created_at",
                },
            )
        return response.json() if response.status_code < 400 else []

    @staticmethod
    def _needs_refresh(token_expires_at: str | None, *, skew_seconds: int = 120) -> bool:
        """True when the token is missing an expiry or expires within `skew_seconds`."""
        if not token_expires_at:
            return False
        try:
            expires = datetime.fromisoformat(str(token_expires_at).replace("Z", "+00:00"))
        except ValueError:
            return False
        return expires <= datetime.now(UTC) + timedelta(seconds=skew_seconds)

    async def _refresh_google_token(self, refresh_token: str) -> dict[str, Any]:
        """Exchange a refresh token for a fresh access token."""
        settings = get_settings()
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
                    "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
            )
        if response.status_code >= 400:
            logger.warning("google token refresh failed status=%s", response.status_code)
            raise ConnectionError("OAUTH_TOKEN_REFRESH_FAILED")
        return response.json()

    async def resolve_access_token(
        self, *, user_id: str, agent_id: str, provider: str = "google"
    ) -> str | None:
        """Resolve bearer token for runtime tools only — never log or return to LLM.

        Automatically refreshes an expired/near-expiry Google token when a
        refresh token is stored, persisting the new access token + expiry.
        """
        bindings = await self.list_bindings(user_id=user_id, agent_id=agent_id)
        if not bindings:
            return None
        connection_ids = [b["connection_id"] for b in bindings if b.get("enabled")]
        if not connection_ids:
            return None
        async with get_supabase_admin_client() as client:
            response = await client.get(
                "/user_connections",
                params={
                    "user_id": f"eq.{user_id}",
                    "provider": f"eq.{provider}",
                    "status": "eq.active",
                    "id": f"in.({','.join(connection_ids)})",
                    "select": "id,secret_ref,refresh_secret_ref,token_expires_at",
                    "limit": "1",
                },
            )
            rows = response.json() if response.status_code < 400 else []
            if not rows:
                return None
            row = rows[0]

            if provider == "google" and self._needs_refresh(row.get("token_expires_at")) and row.get("refresh_secret_ref"):
                try:
                    refresh_token = decrypt_secret(row["refresh_secret_ref"])
                    token = await self._refresh_google_token(refresh_token)
                    new_access = token.get("access_token")
                    if new_access:
                        expires_in = int(token.get("expires_in") or 3600)
                        new_expires = (datetime.now(UTC) + timedelta(seconds=expires_in)).isoformat()
                        await client.patch(
                            "/user_connections",
                            params={"id": f"eq.{row['id']}"},
                            json={
                                "secret_ref": encrypt_secret(new_access),
                                "token_expires_at": new_expires,
                                "last_validated_at": datetime.now(UTC).isoformat(),
                            },
                        )
                        return new_access
                except Exception:  # noqa: BLE001
                    logger.warning("token refresh failed; falling back to stored token")

            try:
                return decrypt_secret(row["secret_ref"])
            except Exception:  # noqa: BLE001
                logger.warning("failed to decrypt connection secret")
                return None

    async def revoke(self, *, user_id: str, connection_id: str) -> bool:
        async with get_supabase_admin_client() as client:
            response = await client.patch(
                "/user_connections",
                params={"id": f"eq.{connection_id}", "user_id": f"eq.{user_id}"},
                json={"status": "revoked", "secret_ref": None, "refresh_secret_ref": None},
            )
        return response.status_code < 400


# Scaffolded providers (disabled)
class MicrosoftConnectionAdapter:
    enabled = False
    provider = "microsoft"


class SlackConnectionAdapter:
    enabled = False
    provider = "slack"


class NotionConnectionAdapter:
    enabled = False
    provider = "notion"
