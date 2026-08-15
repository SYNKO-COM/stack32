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
from agent_service.integrations.app_keys import (
    app_keys_for_tool_ids,
    expand_bind_tool_ids,
    tool_ids_from_scopes,
)
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
        requested_tools = expand_bind_tool_ids(tool_ids)
        scopes = scopes_for_tools(requested_tools or tool_ids or [])
        redirect_uri = settings.GOOGLE_OAUTH_REDIRECT_URI
        expires = (datetime.now(UTC) + timedelta(minutes=15)).isoformat()
        async with get_supabase_admin_client() as client:
            payload = {
                "user_id": user_id,
                "provider": "google",
                "state": state,
                "code_verifier": verifier,
                "redirect_uri": redirect_uri,
                "scopes": scopes,
                "agent_id": agent_id,
                "expires_at": expires,
                "tool_ids": requested_tools,
            }
            inserted = await client.post("/oauth_connection_states", json=payload)
            if inserted.status_code >= 400:
                payload.pop("tool_ids", None)
                await client.post("/oauth_connection_states", json=payload)
        params = {
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(scopes),
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "access_type": "offline",
            "prompt": "select_account consent",
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
            requested_tools = expand_bind_tool_ids(list(row.get("tool_ids") or []))
            if not requested_tools:
                requested_tools = tool_ids_from_scopes(list(row.get("scopes") or []))

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
                "provider_metadata": {"app_ids": app_keys_for_tool_ids(requested_tools)},
            }

            connection: dict[str, Any] = {}
            existing_rows: list[Any] = []
            if email:
                existing = await client.get(
                    "/user_connections",
                    params={
                        "user_id": f"eq.{user_id}",
                        "provider": "eq.google",
                        "account_email": f"eq.{email}",
                        "select": "*",
                        "limit": "1",
                    },
                )
                existing_rows = existing.json() if existing.status_code < 400 else []
            if existing_rows:
                existing_id = existing_rows[0]["id"]
                prev_meta = existing_rows[0].get("provider_metadata") or {}
                prev_apps = list(prev_meta.get("app_ids") or []) if isinstance(prev_meta, dict) else []
                merged_apps = sorted(
                    {
                        *prev_apps,
                        *list(conn_payload["provider_metadata"]["app_ids"]),
                    }
                )
                conn_payload["provider_metadata"] = {**prev_meta, "app_ids": merged_apps} if isinstance(prev_meta, dict) else {
                    "app_ids": merged_apps
                }
                patched = await client.patch(
                    "/user_connections",
                    params={"id": f"eq.{existing_id}"},
                    json=conn_payload,
                    headers={"Prefer": "return=representation"},
                )
                patched_rows = patched.json() if patched.status_code < 400 else []
                connection = patched_rows[0] if patched_rows else {**existing_rows[0], **conn_payload, "id": existing_id}
            else:
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
            if agent_id and connection.get("id") and requested_tools:
                existing_bind = await self.list_bindings(user_id=user_id, agent_id=agent_id)
                prior: list[str] = []
                for b in existing_bind or []:
                    if str(b.get("connection_id")) == str(connection["id"]):
                        prior.extend(list(b.get("tool_ids") or []))
                merged_tools = list(dict.fromkeys([*prior, *requested_tools]))
                await self.bind_connection(
                    user_id=user_id,
                    agent_id=agent_id,
                    connection_id=connection["id"],
                    tool_ids=merged_tools,
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
        installation_id: str | None = None,
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

            # Resolve installation (owner or published consumer).
            install_id = installation_id
            if not install_id:
                from agent_service.installations.service import InstallationService

                install = await InstallationService().get_or_create(
                    user_id=user_id, agent_id=agent_id
                )
                install_id = str(install["id"])
            else:
                inst = await client.get(
                    "/agent_installations",
                    params={
                        "id": f"eq.{install_id}",
                        "user_id": f"eq.{user_id}",
                        "agent_id": f"eq.{agent_id}",
                        "select": "id",
                        "limit": "1",
                    },
                )
                if not (inst.json() if inst.status_code < 400 else []):
                    raise ConnectionError("INSTALLATION_FORBIDDEN")

            # Delete prior binding for this installation+connection (or legacy agent scope).
            if install_id:
                await client.delete(
                    "/agent_connection_bindings",
                    params={
                        "installation_id": f"eq.{install_id}",
                        "connection_id": f"eq.{connection_id}",
                    },
                )
            await client.delete(
                "/agent_connection_bindings",
                params={
                    "agent_id": f"eq.{agent_id}",
                    "connection_id": f"eq.{connection_id}",
                    "user_id": f"eq.{user_id}",
                },
            )
            response = await client.post(
                "/agent_connection_bindings",
                json={
                    "user_id": user_id,
                    "agent_id": agent_id,
                    "installation_id": install_id,
                    "connection_id": connection_id,
                    "tool_ids": tool_ids,
                    "enabled": True,
                },
                headers={"Prefer": "return=representation"},
            )
        rows = response.json() if response.status_code < 400 else []
        return rows[0] if rows else {}

    async def unbind_connection(
        self,
        *,
        user_id: str,
        agent_id: str,
        connection_id: str,
        installation_id: str | None = None,
    ) -> None:
        """Remove installation binding only — does not revoke the global user connection."""
        async with get_supabase_admin_client() as client:
            params: dict[str, str] = {
                "user_id": f"eq.{user_id}",
                "agent_id": f"eq.{agent_id}",
                "connection_id": f"eq.{connection_id}",
            }
            if installation_id:
                params["installation_id"] = f"eq.{installation_id}"
            await client.delete("/agent_connection_bindings", params=params)

    async def list_connections(
        self, *, user_id: str, include_revoked: bool = False
    ) -> list[dict[str, Any]]:
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
        if not isinstance(rows, list):
            return []
        if include_revoked:
            return rows
        return [
            r
            for r in rows
            if str(r.get("status") or "").lower()
            not in {"revoked", "disabled", "deleted"}
        ]

    async def list_bindings(
        self,
        *,
        user_id: str,
        agent_id: str,
        installation_id: str | None = None,
    ) -> list[dict[str, Any]]:
        async with get_supabase_admin_client() as client:
            params: dict[str, str] = {
                "user_id": f"eq.{user_id}",
                "agent_id": f"eq.{agent_id}",
                "select": "id,connection_id,tool_ids,enabled,created_at,installation_id",
            }
            if installation_id:
                params["installation_id"] = f"eq.{installation_id}"
            response = await client.get("/agent_connection_bindings", params=params)
            rows = response.json() if response.status_code < 400 else []
            if installation_id and not rows:
                # Legacy owner fallback: agent-scoped bindings without installation_id.
                from agent_service.installations.service import log_legacy_fallback

                legacy = await client.get(
                    "/agent_connection_bindings",
                    params={
                        "user_id": f"eq.{user_id}",
                        "agent_id": f"eq.{agent_id}",
                        "installation_id": "is.null",
                        "select": "id,connection_id,tool_ids,enabled,created_at,installation_id",
                    },
                )
                legacy_rows = legacy.json() if legacy.status_code < 400 else []
                if legacy_rows:
                    log_legacy_fallback(
                        resource="agent_connection_bindings",
                        agent_id=agent_id,
                        user_id=user_id,
                    )
                    return legacy_rows if isinstance(legacy_rows, list) else []
        return rows if isinstance(rows, list) else []

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

    @staticmethod
    def _scope_set(raw: Any) -> set[str]:
        if isinstance(raw, str):
            return {s for s in raw.split() if s}
        if isinstance(raw, (list, tuple, set)):
            return {str(s) for s in raw if s}
        return set()

    @staticmethod
    def _select_scoped_connection(
        rows: list[dict[str, Any]], *, provider: str, tool_id: str | None
    ) -> dict[str, Any] | None:
        """Pick a connection that fully covers the tool's required scopes.

        Never fall back to a partial-scope token — that yields opaque API 403s
        (e.g. CALENDAR_API_FAILED) instead of asking the user to reconnect.
        """
        if not rows:
            return None
        if provider != "google" or not tool_id:
            return rows[0]
        required = ConnectionManager._scope_set(scopes_for_tools([tool_id]))
        # openid/email are always requested; ignore them for coverage checks.
        required -= ConnectionManager._scope_set(GOOGLE_SCOPES.get("openid") or [])
        if not required:
            return rows[0]
        for row in rows:
            granted = ConnectionManager._scope_set(row.get("scopes"))
            # Legacy rows with empty scopes: keep previous behavior (use token)
            # but prefer a fully scoped connection when available.
            if not granted:
                continue
            if required <= granted:
                return row
        # No scoped match — if every row has empty scopes, use first (legacy).
        if all(not ConnectionManager._scope_set(r.get("scopes")) for r in rows):
            return rows[0]
        return None

    async def resolve_access_token(
        self,
        *,
        user_id: str,
        agent_id: str,
        provider: str = "google",
        tool_id: str | None = None,
    ) -> str | None:
        """Resolve bearer token for runtime tools only — never log or return to LLM.

        When ``tool_id`` is provided for Google, prefer the connection whose stored
        scopes cover the least-privilege scopes required by that tool (so a
        read-only Gmail connection is never used to satisfy a send tool, and the
        correct account is chosen when several are bound). Automatically refreshes
        an expired/near-expiry Google token, persisting the new token + expiry.
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
                    "select": "id,secret_ref,refresh_secret_ref,token_expires_at,scopes",
                    "order": "last_validated_at.desc.nullslast",
                    "limit": "20",
                },
            )
            rows = response.json() if response.status_code < 400 else []
            if not rows:
                return None
            row = self._select_scoped_connection(rows, provider=provider, tool_id=tool_id)
            if not row:
                logger.info(
                    "no google connection covers scopes for tool=%s agent=%s",
                    tool_id,
                    agent_id,
                )
                return None

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
            # Load row first so we can delete the remote Pipedream account.
            existing = await client.get(
                "/user_connections",
                params={
                    "id": f"eq.{connection_id}",
                    "user_id": f"eq.{user_id}",
                    "select": "id,provider,external_account_id,provider_metadata",
                    "limit": "1",
                },
            )
            rows = existing.json() if existing.status_code < 400 else []
            row = rows[0] if isinstance(rows, list) and rows else None

            response = await client.patch(
                "/user_connections",
                params={"id": f"eq.{connection_id}", "user_id": f"eq.{user_id}"},
                json={
                    "status": "revoked",
                    "secret_ref": None,
                    "refresh_secret_ref": None,
                    # Free unique(user_id, provider, account_email) so reconnect
                    # (new Pipedream apn_* id, same Google email) can insert/upsert.
                    "account_email": None,
                },
            )
            if response.status_code >= 400:
                return False
            # Drop all agent bindings so Structure / readiness stop showing Connected.
            await client.delete(
                "/agent_connection_bindings",
                params={
                    "user_id": f"eq.{user_id}",
                    "connection_id": f"eq.{connection_id}",
                },
            )

        if row and str(row.get("provider") or "") == "pipedream":
            external = str(row.get("external_account_id") or "").strip()
            if external:
                try:
                    from agent_service.integrations.pipedream.client import PipedreamClient

                    await PipedreamClient().delete_account(external)
                except Exception:  # noqa: BLE001
                    logger.warning(
                        "pipedream remote delete failed connection=%s", connection_id
                    )
        return True

    async def disconnect_app(
        self,
        *,
        user_id: str,
        agent_id: str,
        app_id: str,
        tool_ids: list[str] | None = None,
        connection_id: str | None = None,
    ) -> dict[str, Any]:
        """Disconnect one product app only (Calendar ≠ Gmail ≠ Notion).

        - Revokes matching Pipedream/app connections (and deletes remote PD accounts)
        - Strips this app's tools from agent bindings without touching other apps
        - Does not revoke unrelated connections
        """
        from agent_service.integrations.app_keys import app_key_from_tool_id

        app = (app_id or "").strip().lower()
        if not app:
            return {"disconnected": False, "revoked": [], "unbound_tools": []}

        connections = await self.list_connections(user_id=user_id, include_revoked=False)
        bindings = await self.list_bindings(user_id=user_id, agent_id=agent_id)
        by_id = {str(c.get("id")): c for c in connections}

        def _conn_app(conn: dict[str, Any]) -> str:
            meta = conn.get("provider_metadata") or {}
            if isinstance(meta, dict) and meta.get("app_id"):
                return str(meta["app_id"]).lower()
            if conn.get("provider") == "google":
                return "google"
            return ""

        target_tools: set[str] = {str(t) for t in (tool_ids or []) if t}
        for binding in bindings or []:
            for tid in binding.get("tool_ids") or []:
                if app_key_from_tool_id(str(tid)) == app:
                    target_tools.add(str(tid))

        revoked: list[str] = []
        # 1) Explicit connection id (UI selected account)
        if connection_id and connection_id in by_id:
            if await self.revoke(user_id=user_id, connection_id=connection_id):
                revoked.append(connection_id)

        # 2) All active connections for this exact app slug
        for conn in connections:
            cid = str(conn.get("id") or "")
            if not cid or cid in revoked:
                continue
            if _conn_app(conn) == app:
                if await self.revoke(user_id=user_id, connection_id=cid):
                    revoked.append(cid)

        # 3) Strip this app's tools from remaining bindings (e.g. suite Google row)
        unbound: list[str] = []
        async with get_supabase_admin_client() as client:
            refreshed = await self.list_bindings(user_id=user_id, agent_id=agent_id)
            for binding in refreshed or []:
                bid = binding.get("id")
                tids = [str(t) for t in (binding.get("tool_ids") or [])]
                keep = [t for t in tids if app_key_from_tool_id(t) != app and t not in target_tools]
                removed = [t for t in tids if t not in keep]
                if not removed:
                    continue
                unbound.extend(removed)
                if not keep:
                    await client.delete(
                        "/agent_connection_bindings",
                        params={"id": f"eq.{bid}", "user_id": f"eq.{user_id}"},
                    )
                else:
                    await client.patch(
                        "/agent_connection_bindings",
                        params={"id": f"eq.{bid}", "user_id": f"eq.{user_id}"},
                        json={"tool_ids": keep},
                    )

        return {
            "disconnected": True,
            "app_id": app,
            "revoked": revoked,
            "unbound_tools": unbound,
        }


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
