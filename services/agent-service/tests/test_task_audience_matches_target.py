"""An outgoing task must be signed for the address it is sent to.

CLOUD_TASKS_OIDC_AUDIENCE used to override the audience on outbound tasks. It
also feeds the inbound accept-list in auth.py, so naming the scheduler's tick
URL there — needed once run tasks moved to their own worker service — mis-signed
every run task at the same time. Cloud Run answered 401, tasks retried forever,
and scheduled runs sat queued while nothing said why.
"""

from __future__ import annotations

import types
from unittest.mock import MagicMock, patch

from agent_service.config import Settings
from agent_service.queue import cloud_tasks as ct

WORKER = "https://worker.example.test/v1/internal/tasks/run"
API_TICK = "https://api.example.test/v1/internal/tasks/schedules/tick"


def _enqueue_with(settings: Settings, monkeypatch) -> dict:
    monkeypatch.setattr(ct, "get_settings", lambda: settings)

    fake_tasks = MagicMock()
    fake_tasks.HttpMethod.POST = 1
    fake_client = MagicMock()
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
        ct.enqueue_via_cloud_tasks(
            run_id="11111111-1111-1111-1111-111111111111",
            user_id="u1",
        )

    return fake_client.create_task.call_args.kwargs["request"]["task"]["http_request"]


def _settings(**extra: str) -> Settings:
    return Settings(
        _env_file=None,
        QUEUE_BACKEND="cloud_tasks",
        GCP_PROJECT_ID="demo-proj",
        GCP_LOCATION="europe-west1",
        CLOUD_TASKS_QUEUE="stack32-runs",
        CLOUD_TASKS_TARGET_URL=WORKER,
        CLOUD_TASKS_OIDC_SERVICE_ACCOUNT="invoker@demo.iam.gserviceaccount.com",
        INTERNAL_SERVICE_TOKEN="token",
        ALLOW_UNVERIFIED_JWT=True,
        AI_EXECUTION_MODE="mock",
        **extra,
    )


def test_audience_is_the_target(monkeypatch) -> None:
    http_req = _enqueue_with(_settings(), monkeypatch)
    assert http_req["url"] == WORKER
    assert http_req["oidc_token"]["audience"] == WORKER


def test_inbound_audience_setting_does_not_resign_outbound_tasks(monkeypatch) -> None:
    """The exact regression: an inbound audience must not travel outbound."""
    http_req = _enqueue_with(
        _settings(CLOUD_TASKS_OIDC_AUDIENCE=API_TICK), monkeypatch
    )
    assert http_req["url"] == WORKER
    assert http_req["oidc_token"]["audience"] == WORKER, (
        "a task sent to the worker signed for the api's tick URL is refused 401"
    )
