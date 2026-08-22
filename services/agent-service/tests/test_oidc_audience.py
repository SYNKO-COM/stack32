"""Internal OIDC tokens must be bound to this service.

google-auth's verify_oauth2_token skips the `aud` check entirely when no
audience argument is supplied, and require_internal_service supplied none. Any
OIDC token minted for the invoker service account — including one issued to a
completely different Cloud Run service — was therefore accepted on
/v1/internal/tasks/run and /v1/internal/tasks/schedules/tick. The `aud` claim
exists to stop exactly that cross-service replay.

Production mints two distinct audiences that share our origin:
  .../v1/internal/tasks/run             (Cloud Tasks)
  .../v1/internal/tasks/schedules/tick  (Cloud Scheduler)
"""

from __future__ import annotations

import pytest

from agent_service.auth import _oidc_audience_ok
from agent_service.config import get_settings

SERVICE = "https://stack32-agent-api-732339494633.europe-west1.run.app"
TASKS_AUD = f"{SERVICE}/v1/internal/tasks/run"
SCHEDULER_AUD = f"{SERVICE}/v1/internal/tasks/schedules/tick"


@pytest.fixture(autouse=True)
def _configured_audience(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "CLOUD_TASKS_TARGET_URL", TASKS_AUD, raising=False)
    monkeypatch.setattr(settings, "CLOUD_TASKS_OIDC_AUDIENCE", "", raising=False)
    return settings


def test_cloud_tasks_audience_is_accepted():
    assert _oidc_audience_ok(TASKS_AUD) is True


def test_scheduler_audience_on_the_same_origin_is_accepted():
    """Both real production audiences must keep working."""
    assert _oidc_audience_ok(SCHEDULER_AUD) is True


@pytest.mark.parametrize(
    "foreign",
    [
        "https://some-other-service-732339494633.europe-west1.run.app/v1/internal/tasks/run",
        "https://evil.example.com/v1/internal/tasks/run",
        "https://stack32-agent-api-732339494633.europe-west1.run.app.evil.com/x",
        "http://stack32-agent-api-732339494633.europe-west1.run.app/v1/internal/tasks/run",
    ],
)
def test_tokens_minted_for_another_service_are_rejected(foreign):
    assert _oidc_audience_ok(foreign) is False


@pytest.mark.parametrize("bad", ["", "   ", "not-a-url", "//no-scheme"])
def test_empty_or_malformed_audiences_are_rejected(bad):
    assert _oidc_audience_ok(bad) is False


def test_fails_closed_when_no_audience_is_configured(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "CLOUD_TASKS_TARGET_URL", "", raising=False)
    monkeypatch.setattr(settings, "CLOUD_TASKS_OIDC_AUDIENCE", "", raising=False)
    assert _oidc_audience_ok(TASKS_AUD) is False


def test_explicit_audience_setting_takes_effect(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "CLOUD_TASKS_TARGET_URL", "", raising=False)
    monkeypatch.setattr(settings, "CLOUD_TASKS_OIDC_AUDIENCE", SCHEDULER_AUD, raising=False)
    assert _oidc_audience_ok(SCHEDULER_AUD) is True
    assert _oidc_audience_ok("https://elsewhere.example.com/x") is False
