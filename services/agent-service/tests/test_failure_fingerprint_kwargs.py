"""Regression: failure_fingerprint must be called with keyword signature."""

from __future__ import annotations

from agent_service.verifier.classify import failure_fingerprint


def test_failure_fingerprint_keyword_only():
    fp = failure_fingerprint("SANDBOX_TESTS_FAILED", signature="AssertionError: x")
    assert isinstance(fp, str) and len(fp) == 16


def test_failure_fingerprint_rejects_positional_signature():
    try:
        failure_fingerprint("SANDBOX_TESTS_FAILED", "oops")  # type: ignore[misc]
        raised = False
    except TypeError:
        raised = True
    assert raised
