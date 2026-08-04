def test_health_returns_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "agent-service",
        "version": "0.1.0",
    }


def test_health_does_not_require_auth(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert "X-Request-ID" in response.headers


def test_ready_reports_degraded_without_configuration(client):
    response = client.get("/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["checks"]["supabase_url"] is False


def test_ready_reports_ready_when_configured(make_settings):
    from fastapi.testclient import TestClient

    from agent_service.main import create_app

    make_settings(
        SUPABASE_URL="https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY="service-role-key",
        SUPABASE_JWT_SECRET="secret",
    )
    client = TestClient(create_app(), raise_server_exceptions=False)
    response = client.get("/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert all(body["checks"].values())
