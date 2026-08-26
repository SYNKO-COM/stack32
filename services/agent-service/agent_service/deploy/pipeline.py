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

Production defaults are **fail-closed**:
- ``require_smoke=True`` — missing smoke runner fails the deploy
- ``require_persistence=True`` — activator returning None / raising fails the deploy
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from agent_service.security.agent_scan import ScanReport, scan_project_files

logger = logging.getLogger(__name__)

# Injectable stage runners. Real implementations wrap the sandbox/build pipeline.
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
    idempotency_key: str | None = None


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
        require_smoke: bool = True,
        require_persistence: bool = True,
        require_tests: bool = True,
    ) -> None:
        self._smoke_runner = smoke_runner
        self._activator = activator or _default_activator
        self._require_smoke = require_smoke
        self._require_persistence = require_persistence
        self._require_tests = require_tests

    async def deploy_snapshot(
        self,
        *,
        user_id: str,
        agent_id: str,
        snapshot: dict[str, Any],
        files: list[dict[str, Any]],
        version_id: str | None = None,
        idempotency_key: str | None = None,
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

        # 3. Tests, when the caller requires them to have passed.
        test_status = snapshot.get("test_status", "not_run")
        if test_status not in ("passed", "passed_with_warnings"):
            if self._require_tests:
                report.stages.append(StageResult("tests", "failed", {"test_status": test_status}))
                return report
            # Publishing lets the author ship an untested version on purpose.
            # The stage is recorded as skipped carrying the real status —
            # never promoted to "passed", so the report stays honest about
            # what was and was not verified.
            report.stages.append(StageResult("tests", "skipped", {"test_status": test_status}))
        else:
            report.stages.append(StageResult("tests", "passed", {"test_status": test_status}))

        # 4. Security scan (blocking on high severity).
        scan = scan_project_files(files)
        report.scan = scan
        if not scan.passed:
            report.stages.append(StageResult("security_scan", "failed", {"high": scan.high}))
            return report
        report.stages.append(StageResult("security_scan", "passed", {"total": len(scan.findings)}))

        # 5. Staging smoke — mandatory in production (require_smoke=True).
        if self._smoke_runner is None:
            if self._require_smoke:
                report.stages.append(
                    StageResult("staging_smoke", "failed", {"reason": "no_runner"})
                )
                return report
            report.stages.append(StageResult("staging_smoke", "skipped", {"reason": "no_runner"}))
        else:
            try:
                smoke = await self._smoke_runner(files)
            except Exception as exc:  # noqa: BLE001
                report.stages.append(
                    StageResult("staging_smoke", "failed", {"error": type(exc).__name__})
                )
                return report
            if not smoke.get("ok", False):
                report.stages.append(StageResult("staging_smoke", "failed", smoke))
                return report
            report.stages.append(StageResult("staging_smoke", "passed", smoke))

        # 6. Activate immutable version on the shared hosted runtime.
        # Stable id from version/snapshot so retries are idempotent.
        deployment_id = (
            idempotency_key
            or (f"{agent_id}:{version_id}:{snapshot_id}" if version_id else str(uuid.uuid4()))
        )
        # Prefer UUID for DB id column when idempotency key is not a UUID.
        try:
            uuid.UUID(str(deployment_id))
            persist_id = str(deployment_id)
        except ValueError:
            persist_id = str(uuid.uuid5(uuid.NAMESPACE_URL, str(deployment_id)))

        try:
            activation = await self._activator(
                ActivationRequest(
                    user_id=user_id,
                    agent_id=agent_id,
                    snapshot_id=str(snapshot_id),
                    version_id=version_id,
                    runtime_version=str(snapshot.get("manifest", {}).get("runtime_version", "")),
                    deployment_id=persist_id,
                    idempotency_key=str(deployment_id),
                )
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("deploy activation raised")
            report.stages.append(
                StageResult(
                    "activate",
                    "failed",
                    {"error": type(exc).__name__, "persisted": False},
                )
            )
            return report

        if activation is None:
            if self._require_persistence:
                report.stages.append(
                    StageResult(
                        "activate",
                        "failed",
                        {"reason": "not_persisted", "persisted": False},
                    )
                )
                return report
            report.stages.append(
                StageResult(
                    "activate",
                    "passed",
                    {"deployment_id": persist_id, "persisted": False},
                )
            )
            report.deployment_id = persist_id
            report.success = True
            return report

        report.deployment_id = str(activation.get("id") or persist_id)
        report.stages.append(
            StageResult(
                "activate",
                "passed",
                {"deployment_id": report.deployment_id, "persisted": True},
            )
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
    """Atomically activate via Postgres RPC ``activate_agent_deployment``."""
    from agent_service.supabase_client import get_supabase_admin_client

    payload = {
        "p_deployment_id": req.deployment_id,
        "p_user_id": req.user_id,
        "p_agent_id": req.agent_id,
        "p_agent_version_id": req.version_id,
        "p_snapshot_id": req.snapshot_id,
        "p_runtime_version": req.runtime_version,
        "p_environment": "production",
        "p_idempotency_key": req.idempotency_key,
    }
    try:
        async with get_supabase_admin_client() as client:
            resp = await client.post(
                "/rpc/activate_agent_deployment",
                json=payload,
                headers={"Prefer": "return=representation"},
            )
            if resp.status_code >= 400:
                logger.error(
                    "activate_agent_deployment failed: status=%s body=%s",
                    resp.status_code,
                    (resp.text or "")[:300],
                )
                return None
            data = resp.json()
            if isinstance(data, list) and data:
                return data[0]
            if isinstance(data, dict) and data:
                return data
            logger.error("activate_agent_deployment returned empty body")
            return None
    except Exception:  # noqa: BLE001
        logger.exception("deploy activation persistence failed (db unavailable)")
        raise
