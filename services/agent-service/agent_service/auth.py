"""Supabase JWT verification and service authentication dependencies."""

from __future__ import annotations

import hashlib
import hmac
import logging
from typing import Annotated, Any
from urllib.parse import urlparse

import jwt as pyjwt
from fastapi import Depends, Header, HTTPException
from jwt import PyJWKClient
from pydantic import BaseModel

from agent_service.config import get_settings

logger = logging.getLogger(__name__)

_jwks_client: PyJWKClient | None = None


class AuthenticatedUser(BaseModel):
    """Minimal identity attached to authenticated requests."""

    user_id: str


def _get_jwks_client(jwks_url: str) -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(jwks_url, cache_keys=True, lifespan=3600)
    return _jwks_client


def _unauthorized(message: str) -> HTTPException:
    return HTTPException(
        status_code=401,
        detail={"code": "unauthorized", "message": message},
    )


def verify_supabase_jwt(token: str) -> dict[str, Any]:
    """Verify a Supabase access token and return its claims."""
    settings = get_settings()
    options = {"require": ["exp", "sub"]}
    issuer = settings.SUPABASE_JWT_ISSUER or None

    if settings.SUPABASE_JWKS_URL:
        try:
            signing_key = _get_jwks_client(settings.SUPABASE_JWKS_URL).get_signing_key_from_jwt(
                token
            )
            return pyjwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256", "ES256"],
                audience="authenticated",
                issuer=issuer,
                options=options,
            )
        except pyjwt.ExpiredSignatureError as exc:
            raise _unauthorized("Token has expired.") from exc
        except pyjwt.PyJWTError as exc:
            if not settings.SUPABASE_JWT_SECRET:
                raise _unauthorized("Invalid token.") from exc

    if settings.SUPABASE_JWT_SECRET:
        try:
            return pyjwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
                issuer=issuer,
                options=options,
            )
        except pyjwt.ExpiredSignatureError as exc:
            raise _unauthorized("Token has expired.") from exc
        except pyjwt.PyJWTError as exc:
            raise _unauthorized("Invalid token.") from exc

    if settings.is_production or not settings.ALLOW_UNVERIFIED_JWT:
        raise _unauthorized("Token verification is not configured.")

    # Explicit opt-in only (local stubs). Never enabled in production.
    logger.warning(
        "ALLOW_UNVERIFIED_JWT enabled — rejecting forged security guarantees (development stub)"
    )
    digest = hashlib.sha256(token.encode()).hexdigest()[:12]
    return {"sub": f"stub-user-{digest}", "exp": 2**31 - 1}


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> AuthenticatedUser:
    """FastAPI dependency resolving the verified current user."""
    if authorization is None or not authorization.lower().startswith("bearer "):
        raise _unauthorized("Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise _unauthorized("Empty bearer token.")
    payload = verify_supabase_jwt(token)
    sub = payload.get("sub")
    if not sub:
        raise _unauthorized("Token has no subject.")
    return AuthenticatedUser(user_id=str(sub))


def _google_oidc_invoker_ok(authorization: str | None) -> bool:
    """Accept Cloud Scheduler / Cloud Tasks OIDC tokens from the invoker SA."""
    settings = get_settings()
    expected_sa = (settings.CLOUD_TASKS_OIDC_SERVICE_ACCOUNT or "").strip().lower()
    if not expected_sa or not authorization:
        return False
    if not authorization.lower().startswith("bearer "):
        return False
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return False
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token
    except ImportError:
        logger.warning("google-auth missing; OIDC internal auth unavailable")
        return False
    try:
        claims = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            clock_skew_in_seconds=10,
        )
    except Exception:
        return False
    email = str(claims.get("email") or "").strip().lower()
    if email != expected_sa:
        return False
    if claims.get("email_verified") is False:
        return False
    issuer = str(claims.get("iss") or "")
    if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
        return False
    return _oidc_audience_ok(str(claims.get("aud") or ""))


def _service_origin(url: str) -> str | None:
    try:
        parsed = urlparse(url)
    except ValueError:
        return None
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def _oidc_audience_ok(aud: str) -> bool:
    """Reject a token minted for a different service.

    ``verify_oauth2_token`` skips the ``aud`` check entirely when no audience is
    passed, so any OIDC token issued to the invoker service account — including
    one minted for an unrelated Cloud Run service — used to be accepted here.
    The ``aud`` claim exists precisely to stop that cross-service replay.

    Cloud Tasks and Cloud Scheduler mint per-endpoint audiences
    (``.../tasks/run`` and ``.../tasks/schedules/tick``) that share the service
    origin, so accept an exact configured match or any audience on our own
    origin. Fail closed when nothing is configured.
    """
    aud = (aud or "").strip()
    if not aud:
        return False
    settings = get_settings()
    configured = [
        (settings.CLOUD_TASKS_OIDC_AUDIENCE or "").strip(),
        (settings.CLOUD_TASKS_TARGET_URL or "").strip(),
    ]
    allowed = {c for c in configured if c}
    if not allowed:
        logger.error("oidc_audience_not_configured; refusing internal OIDC auth")
        return False
    if aud in allowed:
        return True
    aud_origin = _service_origin(aud)
    if aud_origin is None:
        return False
    return any(_service_origin(c) == aud_origin for c in allowed)


async def require_internal_service(
    x_internal_token: Annotated[str | None, Header()] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    """Dependency for internal service-to-service endpoints.

    Accepts ``X-Internal-Token`` (Cloud Tasks HTTP header) or a Google OIDC
    Bearer token minted for ``CLOUD_TASKS_OIDC_SERVICE_ACCOUNT`` (Scheduler).
    """
    settings = get_settings()
    expected = settings.INTERNAL_SERVICE_TOKEN
    if not expected:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "not_configured",
                "message": "INTERNAL_SERVICE_TOKEN is not configured.",
            },
        )
    provided = x_internal_token or ""
    if provided and hmac.compare_digest(provided, expected):
        return
    if _google_oidc_invoker_ok(authorization):
        return
    raise HTTPException(
        status_code=403,
        detail={"code": "forbidden", "message": "Invalid internal service token."},
    )


CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]
InternalService = Annotated[None, Depends(require_internal_service)]
