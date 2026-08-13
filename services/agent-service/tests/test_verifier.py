"""M7: failure classification + unified repair-loop policy."""

from __future__ import annotations

from agent_service.verifier import (
    RepairLoopController,
    classify_failure,
    failure_fingerprint,
)


def test_classify_user_action_codes():
    assert classify_failure("CONNECTION_REQUIRED") == "USER_ACTION_REQUIRED"
    assert classify_failure("INVALID_LLM_KEY") == "USER_ACTION_REQUIRED"
    assert classify_failure("MODEL_NOT_FOUND") == "USER_ACTION_REQUIRED"
    assert classify_failure("TOOL_CONFIG_REQUIRED") == "USER_ACTION_REQUIRED"


def test_classify_provider_temporary():
    assert classify_failure("MODEL_PROVIDER_UNAVAILABLE") == "PROVIDER_TEMPORARY"
    assert classify_failure("PIPEDREAM_UNAVAILABLE") == "PROVIDER_TEMPORARY"
    assert classify_failure("SOMETHING", status=429) == "PROVIDER_TEMPORARY"
    assert classify_failure("SOMETHING", status=503) == "PROVIDER_TEMPORARY"


def test_classify_status_auth_is_user_action():
    assert classify_failure("X", status=401) == "USER_ACTION_REQUIRED"
    assert classify_failure("X", status=403) == "USER_ACTION_REQUIRED"


def test_classify_default_builder_repairable():
    assert classify_failure("SANDBOX_TESTS_FAILED") == "BUILDER_REPAIRABLE"
    assert classify_failure(None) == "BUILDER_REPAIRABLE"
    assert classify_failure("") == "BUILDER_REPAIRABLE"


def test_classify_detail_heuristics():
    assert classify_failure("X", detail="Rate limit exceeded") == "PROVIDER_TEMPORARY"
    assert classify_failure("X", detail="Unauthorized token") == "USER_ACTION_REQUIRED"


def test_fingerprint_stable_and_sensitive():
    a = failure_fingerprint("SANDBOX_TESTS_FAILED", signature="AssertionError x", file="app.py")
    b = failure_fingerprint("SANDBOX_TESTS_FAILED", signature="AssertionError x", file="app.py")
    c = failure_fingerprint("SANDBOX_TESTS_FAILED", signature="AssertionError y", file="app.py")
    assert a == b
    assert a != c


def test_repair_stops_on_user_action():
    ctrl = RepairLoopController()
    decision = ctrl.decide(category="USER_ACTION_REQUIRED")
    assert decision.action == "stop"
    assert decision.reason == "USER_ACTION_REQUIRED"
    assert ctrl.iteration == 0


def test_repair_provider_temporary_bounded_retries():
    ctrl = RepairLoopController(max_provider_retries=2)
    d1 = ctrl.decide(category="PROVIDER_TEMPORARY")
    d2 = ctrl.decide(category="PROVIDER_TEMPORARY")
    d3 = ctrl.decide(category="PROVIDER_TEMPORARY")
    assert d1.action == "retry"
    assert d2.action == "retry"
    assert d3.action == "stop"
    assert d3.reason == "PROVIDER_RETRIES_EXHAUSTED"


def test_repair_hard_max():
    ctrl = RepairLoopController(hard_max=3, max_identical_fingerprints=99)
    actions = [
        ctrl.decide(category="BUILDER_REPAIRABLE", fingerprint=f"fp{i}").action
        for i in range(4)
    ]
    assert actions[:3] == ["repair", "repair", "repair"]
    assert actions[3] == "stop"


def test_repair_fingerprint_early_stop():
    ctrl = RepairLoopController()
    d1 = ctrl.decide(category="BUILDER_REPAIRABLE", fingerprint="same")
    d2 = ctrl.decide(category="BUILDER_REPAIRABLE", fingerprint="same")
    assert d1.action == "repair"
    assert d2.action == "stop"
    assert d2.reason == "REPEATED_FINGERPRINT_NO_PROGRESS"


def test_repair_progress_resets_stall():
    ctrl = RepairLoopController()
    ctrl.decide(category="BUILDER_REPAIRABLE", fingerprint="same")
    # Same fingerprint but progress was made → should keep repairing.
    d = ctrl.decide(category="BUILDER_REPAIRABLE", fingerprint="same", made_progress=True)
    assert d.action == "repair"


def test_repair_reached_target():
    ctrl = RepairLoopController(target_iterations=2, max_identical_fingerprints=99)
    ctrl.decide(category="BUILDER_REPAIRABLE", fingerprint="a")
    assert ctrl.reached_target() is False
    ctrl.decide(category="BUILDER_REPAIRABLE", fingerprint="b")
    assert ctrl.reached_target() is True
