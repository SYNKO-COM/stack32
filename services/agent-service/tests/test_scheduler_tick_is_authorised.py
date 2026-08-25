"""Cloud Scheduler must still be able to tick the api after the worker split.

Run tasks were moved to their own Cloud Run service, and the deploy repointed
CLOUD_TASKS_TARGET_URL at it. The api derives the OIDC audiences it will accept
from that variable, so it stopped accepting tokens minted for its own URL —
every scheduler tick 403'd and no schedule fired for hours, silently. These
tests pin both halves: the code's rule, and the deploy that has to feed it.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from agent_service.auth import _oidc_audience_ok
from agent_service.config import get_settings

REPO_ROOT = Path(__file__).resolve().parents[3]

API_TICK = (
    "https://stack32-agent-api-732339494633.europe-west1.run.app"
    "/v1/internal/tasks/schedules/tick"
)
WORKER_RUN = (
    "https://stack32-agent-worker-732339494633.europe-west1.run.app"
    "/v1/internal/tasks/run"
)


@pytest.fixture
def _settings_from_env(monkeypatch):
    def apply(**env: str | None) -> None:
        for key, value in env.items():
            if value is None:
                monkeypatch.delenv(key, raising=False)
            else:
                monkeypatch.setenv(key, value)
        get_settings.cache_clear()

    yield apply
    get_settings.cache_clear()


def test_targeting_only_the_worker_locks_the_scheduler_out(_settings_from_env) -> None:
    """The exact production misconfiguration, kept as the thing we regressed on."""
    _settings_from_env(
        CLOUD_TASKS_TARGET_URL=WORKER_RUN,
        CLOUD_TASKS_OIDC_AUDIENCE=None,
    )
    assert not _oidc_audience_ok(API_TICK)


def test_naming_the_tick_audience_lets_both_callers_in(_settings_from_env) -> None:
    _settings_from_env(
        CLOUD_TASKS_TARGET_URL=WORKER_RUN,
        CLOUD_TASKS_OIDC_AUDIENCE=API_TICK,
    )
    assert _oidc_audience_ok(API_TICK), "Cloud Scheduler ticks the api"
    assert _oidc_audience_ok(WORKER_RUN), "Cloud Tasks dispatches runs to the worker"


def test_a_stranger_audience_is_still_refused(_settings_from_env) -> None:
    _settings_from_env(
        CLOUD_TASKS_TARGET_URL=WORKER_RUN,
        CLOUD_TASKS_OIDC_AUDIENCE=API_TICK,
    )
    assert not _oidc_audience_ok("https://evil.example.com/v1/internal/tasks/run")


@pytest.mark.parametrize(
    "config_name",
    ["cloudbuild.yaml", "cloudbuild.preprod.yaml"],
)
def test_deploy_sets_both_audience_variables(config_name: str) -> None:
    """A deploy that sets only the target URL reintroduces the outage."""
    config = (REPO_ROOT / config_name).read_text()
    update = [
        line for line in config.splitlines() if "CLOUD_TASKS_TARGET_URL=" in line
    ]
    assert update, f"{config_name} no longer sets CLOUD_TASKS_TARGET_URL"
    for line in update:
        assert "CLOUD_TASKS_OIDC_AUDIENCE=" in line, (
            f"{config_name} points the task target at the worker without naming "
            "the tick audience; the scheduler would 403"
        )
        assert re.search(r"schedules/tick", line), (
            f"{config_name} must name the scheduler tick endpoint as the audience"
        )
