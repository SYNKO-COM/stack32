import pytest
from fastapi.testclient import TestClient

from agent_service.main import create_app

AUTH_HEADERS = {"Authorization": "Bearer test-token"}


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app(), raise_server_exceptions=False)
