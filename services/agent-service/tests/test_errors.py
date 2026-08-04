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
    # Missing required "name" field.
    response = client.post("/v1/agents", json={}, headers=AUTH_HEADERS)
    assert response.status_code == 422
    body = response.json()
    assert_envelope(body, "validation_error")
    assert isinstance(body["error"]["details"], list)
    assert len(body["error"]["details"]) >= 1


def test_unauthenticated_request_returns_401_envelope(client):
    response = client.get("/v1/agents")
    assert response.status_code == 401
    assert_envelope(response.json(), "unauthorized")


def test_any_bearer_token_is_accepted_in_phase_1(client):
    response = client.get("/v1/agents", headers={"Authorization": "Bearer anything-goes"})
    assert response.status_code == 200
    agents = response.json()
    assert len(agents) >= 2
    assert all(a["status"] in {"draft", "building", "ready", "needs_attention", "published"}
               for a in agents)
