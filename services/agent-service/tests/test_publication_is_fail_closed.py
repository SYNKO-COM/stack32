"""Publication never invents proof — but it no longer withholds the button.

Two shortcuts used to exist. A version whose tests never ran was promoted to
``passed_with_warnings`` because the agent looked built and ready; and when
the sandbox smoke runner could not be created, a stand-in returned
``{"ok": True}`` — converting "unable to verify" into "verified". Both are
still gone.

What changed since: shipping an untested version is the author's call, so the
test result no longer blocks publication. The honest half of the old gate
stays — an unrun test is recorded as unrun, never as a pass.
"""

from __future__ import annotations

import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SERVICE = (ROOT / "agent_service/publishing/service.py").read_text()
PIPELINE = (ROOT / "agent_service/deploy/pipeline.py").read_text()


class TestTheShortcutsAreGone:
    def test_not_run_is_never_promoted_to_passed(self):
        assert 'test_status = "passed_with_warnings"' not in SERVICE

    def test_the_sandbox_noop_smoke_is_gone(self):
        assert "sandbox_unavailable_noop" not in SERVICE

    def test_an_unavailable_verifier_blocks_with_a_recoverable_code(self):
        assert "PUBLISH_VERIFICATION_UNAVAILABLE" in SERVICE


class TestAnUntestedVersionCanStillShip:
    def test_publishing_does_not_require_a_passing_test(self):
        assert "require_tests=False" in SERVICE

    def test_the_old_block_is_gone(self):
        assert "DEPLOYMENT_VALIDATION_FAILED" not in SERVICE.split("test_status = rows[0]")[1]

    def test_shipping_untested_is_recorded(self):
        assert "publish_without_passing_test" in SERVICE


class TestTheReportStaysHonest:
    def test_an_unrun_test_is_skipped_not_passed(self):
        branch = PIPELINE.split("# 3. Tests")[1].split("# 4.")[0]
        assert 'StageResult("tests", "skipped"' in branch
        assert 'StageResult("tests", "passed", {"test_status": test_status})' in PIPELINE

    def test_callers_that_want_the_gate_keep_it(self):
        # Default stays strict; only publishing opts out.
        assert "require_tests: bool = True" in PIPELINE

    def test_the_security_scan_still_blocks(self):
        assert 'StageResult("security_scan", "failed"' in PIPELINE
