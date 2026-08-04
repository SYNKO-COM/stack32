"""Placeholder authentication (Phase 1).

Any bearer token is accepted; the token is NOT verified. Real Supabase JWT
verification lands in Phase 2 (see verify_supabase_jwt below).
"""

import base64
import binascii
import hashlib
import json
from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException
from pydantic import BaseModel


class AuthenticatedUser(BaseModel):
    """Minimal identity attached to authenticated requests."""

    user_id: str


def verify_supabase_jwt(token: str) -> dict[str, Any]:
    """Return the (UNVERIFIED) decoded payload of a JWT-shaped token.

    # TODO(phase-2): verify Supabase JWT signature using SUPABASE_JWT_SECRET
    # (HS256), check exp/aud claims, and reject invalid tokens. Phase 1 only
    # best-effort decodes the payload without any verification.
    """
    parts = token.split(".")
    if len(parts) == 3:
        try:
            padded = parts[1] + "=" * (-len(parts[1]) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded))
            if isinstance(payload, dict):
                return payload
        except (ValueError, binascii.Error):
            pass
    # Not a JWT: derive a stable stub identity from the raw token.
    return {"sub": f"stub-user-{hashlib.sha256(token.encode()).hexdigest()[:12]}"}


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> AuthenticatedUser:
    """FastAPI dependency resolving the current user from the Authorization header.

    Phase 1: any bearer token is accepted (no signature verification).
    """
    if authorization is None or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401,
            detail={"code": "unauthorized", "message": "Missing or invalid Authorization header."},
        )
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(
            status_code=401,
            detail={"code": "unauthorized", "message": "Empty bearer token."},
        )
    payload = verify_supabase_jwt(token)
    return AuthenticatedUser(user_id=str(payload.get("sub", "stub-user")))


CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]
