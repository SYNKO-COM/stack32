"""JWT verification tests (HS256 shared-secret path, hermetic)."""

from datetime import UTC, datetime, timedelta

import jwt as pyjwt
from fastapi.testclient import TestClient

from agent_service.main import create_app

SECRET = "test-jwt-secret"


def make_token(
    secret: str = SECRET,
    expires_in: int = 3600,
    audience: str = "authenticated",
    sub: str = "11111111-1111-1111-1111-111111111111",
) -> str:
    now = datetime.now(UTC)
    return pyjwt.encode(
        {
            "sub": sub,
            "aud": audience,
            "iat": now,
            "exp": now + timedelta(seconds=expires_in),
            "role": "authenticated",
        },
        secret,
        algorithm="HS256",
    )


def make_client(make_settings, **overrides) -> TestClient:
    make_settings(SUPABASE_JWT_SECRET=SECRET, **overrides)
    return TestClient(create_app(), raise_server_exceptions=False)


def test_valid_token_is_accepted(make_settings):
    client = make_client(make_settings)
    response = client.post(
        "/v1/builder/threads/t1/messages",
        json={"content": "hello"},
        headers={"Authorization": f"Bearer {make_token()}"},
    )
    # Authenticated but the endpoint itself is NOT_IMPLEMENTED.
    assert response.status_code == 501


def test_expired_token_is_rejected(make_settings):
    client = make_client(make_settings)
    response = client.post(
        "/v1/builder/threads/t1/messages",
        json={"content": "hello"},
        headers={"Authorization": f"Bearer {make_token(expires_in=-60)}"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_bad_signature_is_rejected(make_settings):
    client = make_client(make_settings)
    response = client.post(
        "/v1/builder/threads/t1/messages",
        json={"content": "hello"},
        headers={"Authorization": f"Bearer {make_token(secret='wrong-secret')}"},
    )
    assert response.status_code == 401


def test_wrong_audience_is_rejected(make_settings):
    client = make_client(make_settings)
    response = client.post(
        "/v1/builder/threads/t1/messages",
        json={"content": "hello"},
        headers={"Authorization": f"Bearer {make_token(audience='anon')}"},
    )
    assert response.status_code == 401


def test_missing_header_is_rejected(make_settings):
    client = make_client(make_settings)
    response = client.post("/v1/builder/threads/t1/messages", json={"content": "hello"})
    assert response.status_code == 401


def test_internal_endpoint_requires_service_token(make_settings):
    make_settings(SUPABASE_JWT_SECRET=SECRET, INTERNAL_SERVICE_TOKEN="internal-token")
    client = TestClient(create_app(), raise_server_exceptions=False)

    denied = client.post("/v1/webhooks/internal/ping")
    assert denied.status_code == 403

    allowed = client.post(
        "/v1/webhooks/internal/ping", headers={"X-Internal-Token": "internal-token"}
    )
    assert allowed.status_code == 200
    assert allowed.json() == {"status": "ok"}


def test_production_requires_verification_config():
    import pytest

    from agent_service.config import Settings

    with pytest.raises(ValueError):
        Settings(
            _env_file=None,
            ENVIRONMENT="production",
            SUPABASE_URL="https://example.supabase.co",
            SUPABASE_SERVICE_ROLE_KEY="key",
            INTERNAL_SERVICE_TOKEN="token",
            # no JWKS URL and no JWT secret -> must fail fast
        )
