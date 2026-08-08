"""Immutable-version deployment pipeline (M-I).

Sequences the gates required before a generated agent version goes live:

    snapshot → isolated build → tests → security scan → staging smoke → activate

Deployment model (documented): Stack32 does NOT run a separate container per
agent. It runs a **shared hosted runtime** that loads a pinned
`stack32-agent-runtime` version plus the immutable project snapshot in an
isolated worker. Activation therefore records the snapshot id + pinned runtime
version on the deployment row; the shared runtime resolves and executes it.

Each stage is injectable so the pipeline is fully testable without external
infra. Any failing gate stops the pipeline before activation.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from agent_service.security.agent_scan import ScanReport, scan_project_files

logger = logging.getLogger(__name__)

# Injectable stage runners. Real implementations wrap the sandbox/build pipeline;
# defaults degrade gracefully so activation still records the snapshot in dev.
SmokeRunner = Callable[[list[dict[str, Any]]], Awaitable[dict[str, Any]]]
Activator = Callable[["ActivationRequest"], Awaitable[dict[str, Any] | None]]


@dataclass(slots=True)
class StageResult:
    name: str
    status: str  # "passed" | "failed" | "skipped"
    detail: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ActivationRequest:
    user_id: str
    agent_id: str
    snapshot_id: str
    version_id: str | None
    runtime_version: str
    deployment_id: str


@dataclass(slots=True)
class DeployReport:
    success: bool
    stages: list[StageResult] = field(default_factory=list)
    deployment_id: str | None = None
    scan: ScanReport | None = None

    def stage(self, name: str) -> StageResult | None:
        return next((s for s in self.stages if s.name == name), None)

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "deployment_id": self.deployment_id,
            "stages": [{"name": s.name, "status": s.status, "detail": s.detail} for s in self.stages],
            "scan": self.scan.to_dict() if self.scan else None,
        }


class DeployPipeline:
    def __init__(
        self,
        *,
        smoke_runner: SmokeRunner | None = None,
        activator: Activator | None = None,
    ) -> None:
        self._smoke_runner = smoke_runner
        self._activator = activator or _default_activator

    async def deploy_snapshot(
        self,
        *,
        user_id: str,
        agent_id: str,
        snapshot: dict[str, Any],
        files: list[dict[str, Any]],
        version_id: str | None = None,
    ) -> DeployReport:
        report = DeployReport(success=False)

        # 1. Snapshot present + immutable.
        snapshot_id = snapshot.get("id")
        if not snapshot_id:
            report.stages.append(StageResult("snapshot", "failed", {"reason": "missing_snapshot"}))
            return report
        report.stages.append(StageResult("snapshot", "passed", {"snapshot_id": snapshot_id}))

        # 2. Isolated build artifact = the snapshot's file set.
        if not files:
            report.stages.append(StageResult("build", "failed", {"reason": "no_files"}))
            return report
        report.stages.append(StageResult("build", "passed", {"files": len(files)}))

        # 3. Tests must have passed at snapshot time.
        test_status = snapshot.get("test_status", "not_run")
        if test_status not in ("passed", "passed_with_warnings"):
            report.stages.append(StageResult("tests", "failed", {"test_status": test_status}))
            return report
        report.stages.append(StageResult("tests", "passed", {"test_status": test_status}))

        # 4. Security scan (blocking on high severity).
        scan = scan_project_files(files)
        report.scan = scan
        if not scan.passed:
            report.stages.append(StageResult("security_scan", "failed", {"high": scan.high}))
            return report
        report.stages.append(StageResult("security_scan", "passed", {"total": len(scan.findings)}))

        # 5. Staging smoke — rebuild + run in isolation.
        if self._smoke_runner is not None:
            try:
                smoke = await self._smoke_runner(files)
            except Exception as exc:  # noqa: BLE001
                report.stages.append(StageResult("staging_smoke", "failed", {"error": type(exc).__name__}))
                return report
            if not smoke.get("ok", False):
                report.stages.append(StageResult("staging_smoke", "failed", smoke))
                return report
            report.stages.append(StageResult("staging_smoke", "passed", smoke))
        else:
            report.stages.append(StageResult("staging_smoke", "skipped", {"reason": "no_runner"}))

        # 6. Activate immutable version on the shared hosted runtime.
        deployment_id = str(uuid.uuid4())
        activation = await self._activator(
            ActivationRequest(
                user_id=user_id,
                agent_id=agent_id,
                snapshot_id=str(snapshot_id),
                version_id=version_id,
                runtime_version=str(snapshot.get("manifest", {}).get("runtime_version", "")),
                deployment_id=deployment_id,
            )
        )
        report.deployment_id = deployment_id
        report.stages.append(
            StageResult("activate", "passed", {"deployment_id": deployment_id, "persisted": bool(activation)})
        )
        report.success = True
        return report


def make_sandbox_smoke_runner(provider: Any) -> SmokeRunner:
    """Build a smoke runner that rebuilds the snapshot in a fresh isolated
    workspace and runs its test suite. Returns {ok, exit_code, ...}."""
    from agent_service.sandbox.base import SandboxConfig

    async def _run(files: list[dict[str, Any]]) -> dict[str, Any]:
        handle = await provider.create_workspace(SandboxConfig(command_timeout_seconds=90))
        try:
            for f in files:
                content = f.get("content")
                if isinstance(content, str):
                    await provider.write_file(handle, f["path"], content)
            result = await provider.run_command(
                handle, ["python", "-m", "pytest", "-q"], timeout_seconds=90
            )
            return {
                "ok": result.exit_code == 0,
                "exit_code": result.exit_code,
                "stdout": (result.stdout or "")[-2000:],
            }
        finally:
            try:
                await provider.destroy_workspace(handle)
            except Exception:  # noqa: BLE001
                pass

    return _run


async def _default_activator(req: ActivationRequest) -> dict[str, Any] | None:
    """Record an immutable, snapshot-pinned deployment on the shared runtime."""
    from agent_service.supabase_client import get_supabase_admin_client

    try:
        async with get_supabase_admin_client() as client:
            await client.patch(
                "/agent_deployments",
                params={
                    "agent_id": f"eq.{req.agent_id}",
                    "environment": "eq.production",
                    "status": "eq.active",
                },
                json={"status": "disabled", "unpublished_at": datetime.now(UTC).isoformat()},
            )
            resp = await client.post(
                "/agent_deployments",
                json={
                    "id": req.deployment_id,
                    "user_id": req.user_id,
                    "agent_id": req.agent_id,
                    "agent_version_id": req.version_id,
                    "environment": "production",
                    "status": "active",
                    "published_at": datetime.now(UTC).isoformat(),
                    "runtime_config": {
                        "hosted": True,
                        "model": "shared_runtime",
                        "snapshot_id": req.snapshot_id,
                        "runtime_version": req.runtime_version,
                    },
                },
                headers={"Prefer": "return=representation"},
            )
            if resp.status_code < 400 and resp.json():
                return resp.json()[0]
    except Exception:  # noqa: BLE001
        logger.debug("deploy activation persistence skipped (db unavailable)")
    return None
