"""Publication needs positive proof — it never invents its own.

Two shortcuts used to exist. A version whose tests never ran was promoted to
``passed_with_warnings`` because the agent looked built and ready; and when
the sandbox smoke runner could not be created, a stand-in returned
``{"ok": True}`` — converting "unable to verify" into "verified". Both are
gone: the gate now answers with a recoverable error and publishes nothing.
"""

from __future__ import annotations

import pathlib

SERVICE = (
    pathlib.Path(__file__).resolve().parents[1]
    / "agent_service/publishing/service.py"
).read_text()


class TestTheShortcutsAreGone:
    def test_not_run_is_never_promoted_to_passed(self):
        assert 'test_status = "passed_with_warnings"' not in SERVICE

    def test_the_sandbox_noop_smoke_is_gone(self):
        assert "sandbox_unavailable_noop" not in SERVICE

    def test_an_unavailable_verifier_blocks_with_a_recoverable_code(self):
        assert "PUBLISH_VERIFICATION_UNAVAILABLE" in SERVICE

    def test_a_version_without_tests_gets_its_own_code(self):
        # TEST_NOT_RUN tells the person what to do; TEST_FAILED would lie.
        assert "TEST_NOT_RUN" in SERVICE


class TestTheGateStillLetsProofThrough:
    def test_passed_versions_are_still_accepted(self):
        assert '("passed", "passed_with_warnings")' in SERVICE
