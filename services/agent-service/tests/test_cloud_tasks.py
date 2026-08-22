"""Cloud Tasks enqueue routing and config checks (no real GCP)."""

from __future__ import annotations

import types
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from agent_service.config import Settings
from agent_service.queue import cloud_tasks as ct
from agent_service.queue import dispatch as dispatch_mod


def test_missing_cloud_tasks_config_lists_fields():
    settings = Settings(
        _env_file=None,
        QUEUE_BACKEND="cloud_tasks",
        ALLOW_UNVERIFIED_JWT=True,
        AI_EXECUTION_MODE="mock",
    )
    missing = ct.missing_cloud_tasks_config(settings)
    assert "GCP_PROJECT_ID" in missing
    assert "CLOUD_TASKS_QUEUE" in missing
    assert "CLOUD_TASKS_TARGET_URL" in missing


def test_cloud_tasks_ready_when_complete():
    settings = Settings(
        _env_file=None,
        QUEUE_BACKEND="cloud_tasks",
        GCP_PROJECT_ID="demo-proj",
        GCP_LOCATION="europe-west1",
        CLOUD_TASKS_QUEUE="stack32-runs",
        CLOUD_TASKS_TARGET_URL="https://example.test/v1/internal/tasks/run",
        INTERNAL_SERVICE_TOKEN="token",
        ALLOW_UNVERIFIED_JWT=True,
        AI_EXECUTION_MODE="mock",
    )
    assert ct.cloud_tasks_ready(settings) is True


def test_enqueue_via_cloud_tasks_uses_mock_client(monkeypatch):
    settings = Settings(
        _env_file=None,
        QUEUE_BACKEND="cloud_tasks",
        GCP_PROJECT_ID="demo-proj",
        GCP_LOCATION="europe-west1",
        CLOUD_TASKS_QUEUE="stack32-runs",
        CLOUD_TASKS_TARGET_URL="https://example.test/v1/internal/tasks/run",
        CLOUD_TASKS_OIDC_SERVICE_ACCOUNT="invoker@demo.iam.gserviceaccount.com",
        INTERNAL_SERVICE_TOKEN="token",
        ALLOW_UNVERIFIED_JWT=True,
        AI_EXECUTION_MODE="mock",
    )
    monkeypatch.setattr(ct, "get_settings", lambda: settings)

    fake_tasks = MagicMock()
    fake_tasks.HttpMethod.POST = 1
    fake_client = MagicMock()
    fake_client.create_task.return_value = MagicMock(
        name="projects/demo/locations/europe-west1/queues/stack32-runs/tasks/t1"
    )
    fake_tasks.CloudTasksClient.return_value = fake_client

    google_mod = types.ModuleType("google")
    cloud_mod = types.ModuleType("google.cloud")
    cloud_mod.tasks_v2 = fake_tasks
    google_mod.cloud = cloud_mod

    with patch.dict(
        "sys.modules",
        {
            "google": google_mod,
            "google.cloud": cloud_mod,
            "google.cloud.tasks_v2": fake_tasks,
        },
    ):
        name = ct.enqueue_via_cloud_tasks(
            run_id="11111111-1111-1111-1111-111111111111",
            user_id="u1",
        )

    assert name
    fake_client.create_task.assert_called_once()
    request = fake_client.create_task.call_args.kwargs["request"]
    assert "queues/stack32-runs" in request["parent"]
    http_req = request["task"]["http_request"]
    assert http_req["url"].endswith("/v1/internal/tasks/run")
    assert http_req["headers"]["X-Internal-Token"] == "token"
    assert http_req["oidc_token"]["service_account_email"].startswith("invoker@")


@pytest.mark.asyncio
async def test_dispatch_uses_cloud_tasks_backend(monkeypatch):
    monkeypatch.setattr(
        dispatch_mod,
        "get_settings",
        lambda: MagicMock(QUEUE_INLINE=False, QUEUE_BACKEND="cloud_tasks"),
    )
    mocked = MagicMock(return_value="projects/p/locations/l/tasks/t")
    monkeypatch.setattr(
        "agent_service.queue.cloud_tasks.enqueue_via_cloud_tasks",
        mocked,
    )
    db = MagicMock()
    db.enqueue_run = AsyncMock()
    executed = AsyncMock(return_value={"status": "ok"})
    result = await dispatch_mod.dispatch_run(
        db=db, run_id="r1", user_id="u1", execute=executed
    )
    assert result["status"] == "queued"
    assert result["queue_backend"] == "cloud_tasks"
    mocked.assert_called_once_with(run_id="r1", user_id="u1")
    db.enqueue_run.assert_not_called()
    executed.assert_not_called()


def test_ready_fail_fast_production_cloud_tasks(make_settings):
    from fastapi.testclient import TestClient

    from agent_service.main import create_app

    make_settings(
        ENVIRONMENT="production",
        ALLOW_UNVERIFIED_JWT=False,
        SUPABASE_URL="https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY="service-role-key",
        SUPABASE_JWT_SECRET="secret",
        INTERNAL_SERVICE_TOKEN="tok",
        SECRETS_ENCRYPTION_KEY="x" * 44,
        AI_EXECUTION_MODE="live",
        AGENT_RUNTIME_VERSION="langgraph",
        DATABASE_URL="postgresql://localhost/db",
        SANDBOX_PROVIDER="e2b",
        BUILDER_SANDBOX_ENABLED=True,
        E2B_API_KEY="e2b_test",
        QUEUE_BACKEND="cloud_tasks",
        # intentionally missing CLOUD_TASKS_* / GCP_*
    )
    client = TestClient(create_app(), raise_server_exceptions=False)
    response = client.get("/ready")
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["checks"]["cloud_tasks"] is False


def test_task_requests_the_maximum_dispatch_deadline(monkeypatch):
    """Cloud Tasks abandons an HTTP task after 10 minutes unless told otherwise.

    Unset, a coding build past ten minutes was dropped mid-flight and retried
    while the first attempt kept running on Cloud Run — the same LLM build paid
    for twice. Google caps this at 30 minutes; ask for the ceiling explicitly.
    """
    settings = Settings(
        _env_file=None,
        QUEUE_BACKEND="cloud_tasks",
        GCP_PROJECT_ID="demo-proj",
        GCP_LOCATION="europe-west1",
        CLOUD_TASKS_QUEUE="stack32-runs",
        CLOUD_TASKS_TARGET_URL="https://example.test/v1/internal/tasks/run",
        INTERNAL_SERVICE_TOKEN="token",
        ALLOW_UNVERIFIED_JWT=True,
        AI_EXECUTION_MODE="mock",
    )
    monkeypatch.setattr(ct, "get_settings", lambda: settings)

    fake_tasks = MagicMock()
    fake_tasks.HttpMethod.POST = 1
    fake_client = MagicMock()
    fake_client.create_task.return_value = MagicMock(name="tasks/t1")
    fake_tasks.CloudTasksClient.return_value = fake_client

    google_mod = types.ModuleType("google")
    cloud_mod = types.ModuleType("google.cloud")
    cloud_mod.tasks_v2 = fake_tasks
    google_mod.cloud = cloud_mod

    with patch.dict(
        "sys.modules",
        {"google": google_mod, "google.cloud": cloud_mod, "google.cloud.tasks_v2": fake_tasks},
    ):
        ct.enqueue_via_cloud_tasks(run_id="11111111-1111-1111-1111-111111111111")

    task = fake_client.create_task.call_args.kwargs["request"]["task"]
    assert task["dispatch_deadline"] == {"seconds": 1800}


def test_dispatch_deadline_is_clamped_to_googles_ceiling(monkeypatch):
    settings = Settings(
        _env_file=None,
        QUEUE_BACKEND="cloud_tasks",
        GCP_PROJECT_ID="demo-proj",
        GCP_LOCATION="europe-west1",
        CLOUD_TASKS_QUEUE="stack32-runs",
        CLOUD_TASKS_TARGET_URL="https://example.test/v1/internal/tasks/run",
        INTERNAL_SERVICE_TOKEN="token",
        CLOUD_TASKS_DISPATCH_DEADLINE_SECONDS=7200,
        ALLOW_UNVERIFIED_JWT=True,
        AI_EXECUTION_MODE="mock",
    )
    monkeypatch.setattr(ct, "get_settings", lambda: settings)

    fake_tasks = MagicMock()
    fake_tasks.HttpMethod.POST = 1
    fake_client = MagicMock()
    fake_client.create_task.return_value = MagicMock(name="tasks/t1")
    fake_tasks.CloudTasksClient.return_value = fake_client

    google_mod = types.ModuleType("google")
    cloud_mod = types.ModuleType("google.cloud")
    cloud_mod.tasks_v2 = fake_tasks
    google_mod.cloud = cloud_mod

    with patch.dict(
        "sys.modules",
        {"google": google_mod, "google.cloud": cloud_mod, "google.cloud.tasks_v2": fake_tasks},
    ):
        ct.enqueue_via_cloud_tasks(run_id="11111111-1111-1111-1111-111111111111")

    task = fake_client.create_task.call_args.kwargs["request"]["task"]
    assert task["dispatch_deadline"]["seconds"] == 1800, "Cloud Tasks rejects anything above 30min"
