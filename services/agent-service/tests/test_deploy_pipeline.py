"""M-I: security scan + staged deployment pipeline."""

from __future__ import annotations

from agent_service.deploy.pipeline import ActivationRequest, DeployPipeline
from agent_service.security.agent_scan import scan_project_files

_CLEAN_FILES = [
    {"path": "src/agent/main.py", "content": "async def run():\n    return 1\n"},
    {"path": "agent.yaml", "content": "name: test\n"},
]

_SNAPSHOT = {
    "id": "snap-1",
    "test_status": "passed",
    "manifest": {"runtime_version": "0.1.0", "name": "Test"},
}


def test_scanner_flags_dangerous_code():
    files = [{"path": "src/agent/tools.py", "content": "import os\nos.system('rm -rf /')\nx = eval('1+1')\n"}]
    report = scan_project_files(files)
    assert report.passed is False
    codes = {f.code for f in report.findings}
    assert "OS_SYSTEM" in codes
    assert "EVAL" in codes


def test_scanner_flags_hardcoded_secret():
    files = [{"path": "src/agent/config.py", "content": 'API_KEY = "sk-abcdefghijklmnopqrstuvwxyz123"\n'}]
    report = scan_project_files(files)
    assert report.passed is False
    assert any(f.code in {"HARDCODED_SECRET", "OPENAI_KEY"} for f in report.findings)


def test_scanner_passes_clean_code():
    report = scan_project_files(_CLEAN_FILES)
    assert report.passed is True
    assert report.high == 0


async def test_pipeline_full_success():
    activated = {}

    async def _activator(req: ActivationRequest):
        activated["snapshot_id"] = req.snapshot_id
        activated["runtime_version"] = req.runtime_version
        return {"id": req.deployment_id}

    async def _smoke(files):
        return {"ok": True, "tests": "passed"}

    pipeline = DeployPipeline(smoke_runner=_smoke, activator=_activator)
    report = await pipeline.deploy_snapshot(
        user_id="u1", agent_id="a1", snapshot=_SNAPSHOT, files=_CLEAN_FILES, version_id="v1"
    )
    assert report.success is True
    assert [s.name for s in report.stages] == [
        "snapshot", "build", "tests", "security_scan", "staging_smoke", "activate"
    ]
    assert all(s.status == "passed" for s in report.stages)
    assert activated["snapshot_id"] == "snap-1"
    assert activated["runtime_version"] == "0.1.0"


async def test_pipeline_blocks_on_security_finding():
    async def _activator(req: ActivationRequest):  # pragma: no cover - must not run
        raise AssertionError("activation must not happen on failed scan")

    async def _smoke(files):
        return {"ok": True}

    bad_files = [{"path": "src/agent/x.py", "content": "import os\nos.system('id')\n"}]
    pipeline = DeployPipeline(smoke_runner=_smoke, activator=_activator)
    report = await pipeline.deploy_snapshot(
        user_id="u1", agent_id="a1", snapshot=_SNAPSHOT, files=bad_files
    )
    assert report.success is False
    assert report.stage("security_scan").status == "failed"
    assert report.stage("activate") is None


async def test_pipeline_blocks_on_failed_tests():
    async def _smoke(files):
        return {"ok": True}

    pipeline = DeployPipeline(smoke_runner=_smoke)
    snap = {**_SNAPSHOT, "test_status": "failed"}
    report = await pipeline.deploy_snapshot(
        user_id="u1", agent_id="a1", snapshot=snap, files=_CLEAN_FILES
    )
    assert report.success is False
    assert report.stage("tests").status == "failed"


async def test_pipeline_blocks_on_smoke_failure():
    async def _smoke(files):
        return {"ok": False, "error": "tests failed in staging"}

    pipeline = DeployPipeline(smoke_runner=_smoke)
    report = await pipeline.deploy_snapshot(
        user_id="u1", agent_id="a1", snapshot=_SNAPSHOT, files=_CLEAN_FILES
    )
    assert report.success is False
    assert report.stage("staging_smoke").status == "failed"


async def test_pipeline_missing_smoke_runner_fails_closed():
    pipeline = DeployPipeline(require_smoke=True, require_persistence=True)
    report = await pipeline.deploy_snapshot(
        user_id="u1", agent_id="a1", snapshot=_SNAPSHOT, files=_CLEAN_FILES
    )
    assert report.success is False
    assert report.stage("staging_smoke").status == "failed"
    assert report.stage("staging_smoke").detail.get("reason") == "no_runner"


async def test_pipeline_smoke_raise_fails():
    async def _smoke(files):
        raise RuntimeError("sandbox boom")

    pipeline = DeployPipeline(smoke_runner=_smoke)
    report = await pipeline.deploy_snapshot(
        user_id="u1", agent_id="a1", snapshot=_SNAPSHOT, files=_CLEAN_FILES
    )
    assert report.success is False
    assert report.stage("staging_smoke").status == "failed"


async def test_pipeline_activator_none_fails():
    async def _smoke(files):
        return {"ok": True}

    async def _activator(req: ActivationRequest):
        return None

    pipeline = DeployPipeline(smoke_runner=_smoke, activator=_activator)
    report = await pipeline.deploy_snapshot(
        user_id="u1", agent_id="a1", snapshot=_SNAPSHOT, files=_CLEAN_FILES
    )
    assert report.success is False
    assert report.stage("activate").status == "failed"
    assert report.stage("activate").detail.get("persisted") is False


async def test_pipeline_activator_raises_fails():
    async def _smoke(files):
        return {"ok": True}

    async def _activator(req: ActivationRequest):
        raise ConnectionError("db down")

    pipeline = DeployPipeline(smoke_runner=_smoke, activator=_activator)
    report = await pipeline.deploy_snapshot(
        user_id="u1", agent_id="a1", snapshot=_SNAPSHOT, files=_CLEAN_FILES
    )
    assert report.success is False
    assert report.stage("activate").status == "failed"


async def test_pipeline_dev_may_skip_smoke_when_explicit():
    async def _activator(req: ActivationRequest):
        return {"id": req.deployment_id}

    pipeline = DeployPipeline(
        smoke_runner=None,
        activator=_activator,
        require_smoke=False,
        require_persistence=True,
    )
    report = await pipeline.deploy_snapshot(
        user_id="u1", agent_id="a1", snapshot=_SNAPSHOT, files=_CLEAN_FILES
    )
    assert report.success is True
    assert report.stage("staging_smoke").status == "skipped"


async def test_sandbox_smoke_runner_runs_real_tests():
    """Staging smoke actually rebuilds + runs pytest in an isolated workspace."""
    from agent_service.deploy.pipeline import make_sandbox_smoke_runner
    from agent_service.sandbox.local import LocalSandbox

    files = [
        {"path": "tests/test_smoke.py", "content": "def test_ok():\n    assert 1 + 1 == 2\n"},
    ]
    runner = make_sandbox_smoke_runner(LocalSandbox())
    result = await runner(files)
    assert result["ok"] is True
    assert result["exit_code"] == 0
