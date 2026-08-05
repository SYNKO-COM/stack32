"""Supabase JWT verification and service authentication dependencies."""

from __future__ import annotations

import hashlib
import hmac
import logging
from typing import Annotated, Any

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


async def require_internal_service(
    x_internal_token: Annotated[str | None, Header()] = None,
) -> None:
    """Dependency for internal service-to-service endpoints."""
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
    if not hmac.compare_digest(provided, expected):
        raise HTTPException(
            status_code=403,
            detail={"code": "forbidden", "message": "Invalid internal service token."},
        )


CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]
InternalService = Annotated[None, Depends(require_internal_service)]
