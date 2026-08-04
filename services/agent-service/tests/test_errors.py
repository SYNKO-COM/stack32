from tests.conftest import AUTH_HEADERS


def assert_envelope(body: dict, code: str) -> None:
    assert set(body.keys()) == {"error"}
    error = body["error"]
    assert error["code"] == code
    assert isinstance(error["message"], str) and error["message"]
    assert isinstance(error["request_id"], str) and error["request_id"]


def test_404_returns_error_envelope(client):
    response = client.get("/v1/does-not-exist", headers=AUTH_HEADERS)
    assert response.status_code == 404
    assert_envelope(response.json(), "not_found")
    assert response.json()["error"]["request_id"] == response.headers["X-Request-ID"]


def test_validation_error_returns_envelope_with_details(client):
    # Missing required "content" field.
    response = client.post(
        "/v1/builder/threads/thread-1/messages", json={}, headers=AUTH_HEADERS
    )
    assert response.status_code == 422
    body = response.json()
    assert_envelope(body, "validation_error")
    assert isinstance(body["error"]["details"], list)
    assert len(body["error"]["details"]) >= 1


def test_unauthenticated_request_returns_401_envelope(client):
    response = client.get("/v1/agents/some-id")
    assert response.status_code == 401
    assert_envelope(response.json(), "unauthorized")


def test_execution_endpoints_return_typed_not_implemented(client):
    for path in [
        "/v1/builder/threads/t1/messages",
        "/v1/live/threads/t1/messages",
    ]:
        response = client.post(path, json={"content": "hello"}, headers=AUTH_HEADERS)
        assert response.status_code == 501, path
        assert_envelope(response.json(), "not_implemented")

    response = client.post("/v1/agents/a1/test", headers=AUTH_HEADERS)
    assert response.status_code == 501
    assert_envelope(response.json(), "not_implemented")


def test_agent_read_requires_supabase_configuration(client):
    # Dev token is accepted (no 401), but persistence is not configured (503).
    response = client.get("/v1/agents/some-id", headers=AUTH_HEADERS)
    assert response.status_code == 503
    assert_envelope(response.json(), "not_configured")
