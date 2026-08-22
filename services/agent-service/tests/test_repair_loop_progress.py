"""Regression tests for the repair loop stop policy.

Production symptom these lock down: a trivial agent build failed verification,
the user clicked "Corriger pour moi", and the loop returned
REPEATED_FINGERPRINT_NO_PROGRESS after a *single* repair attempt — because
``max_identical_fingerprints`` was left at its dataclass default of 2 and
progress was measured by comparing failure fingerprints.
"""

from __future__ import annotations

import pytest

from agent_service.config import get_settings
from agent_service.verifier.classify import (
    made_forward_progress,
    verification_progress_score,
)
from agent_service.verifier.repair import RepairLoopController


def _controller() -> RepairLoopController:
    settings = get_settings()
    return RepairLoopController(
        target_iterations=max(5, settings.MAX_REPAIR_ATTEMPTS),
        hard_max=max(8, settings.MAX_REPAIR_ATTEMPTS + 3),
        max_identical_fingerprints=max(3, settings.MAX_REPAIR_ATTEMPTS),
    )


def test_identical_failure_survives_more_than_one_attempt():
    """The old default stopped at iteration 2; we must get real attempts."""
    settings = get_settings()
    threshold = max(3, settings.MAX_REPAIR_ATTEMPTS)
    ctrl = _controller()
    fp = "SANDBOX_TESTS_FAILED:same"
    actions = [
        ctrl.decide(category="BUILDER_REPAIRABLE", fingerprint=fp, made_progress=False).action
        for _ in range(threshold + 1)
    ]
    # The regression: this used to be ["repair", "stop", ...] — one attempt only.
    assert actions[0] == "repair"
    assert actions[1] == "repair", "loop must not give up after a single repair"
    assert actions.count("repair") == threshold - 1, actions
    # It must still terminate rather than loop forever.
    assert "stop" in actions


def test_forward_progress_resets_the_stall_counter():
    """Shrinking failure counts must keep the loop alive indefinitely."""
    ctrl = _controller()
    fp = "SANDBOX_TESTS_FAILED:same"
    for _ in range(10):
        d = ctrl.decide(category="BUILDER_REPAIRABLE", fingerprint=fp, made_progress=True)
        if d.action == "stop":
            assert d.reason == "HARD_MAX_ITERATIONS_REACHED"
            return
        assert d.action == "repair"


def test_user_action_never_loops():
    ctrl = _controller()
    d = ctrl.decide(category="USER_ACTION_REQUIRED", fingerprint="x")
    assert d.action == "stop" and d.reason == "USER_ACTION_REQUIRED"


@pytest.mark.parametrize(
    ("stdout", "expected"),
    [
        ("=== 4 failed, 2 passed in 0.1s ===", 4),
        ("=== 12 passed in 0.3s ===", 0),
        ("total gibberish", -1),
    ],
)
def test_progress_score_parses_pytest_output(stdout, expected):
    assert verification_progress_score(stdout, None)[0] == expected


def test_progress_score_parses_ruff_output():
    assert verification_progress_score(None, "Found 7 errors.")[1] == 7
    assert verification_progress_score(None, "All checks passed!")[1] == 0


def test_fewer_failing_tests_counts_as_progress():
    """The exact case the fingerprint check got wrong."""
    assert made_forward_progress((4, 0), (1, 0)) is True
    assert made_forward_progress((4, 0), (4, 0)) is False
    assert made_forward_progress(None, (4, 0)) is False
    assert made_forward_progress((-1, -1), (1, 0)) is False


def test_lint_only_improvement_counts_as_progress():
    assert made_forward_progress((2, 9), (2, 3)) is True
