"""REPAIR/MODIFY engine — restore real project snapshot, then patch in E2B."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from agent_service.builder.build_pipeline import CodeBuildPipeline, BuildReport
from agent_service.builder.projects import get_snapshot_files, list_snapshots
from agent_service.builder.repair_contract import RepairContract, build_repair_contract
from agent_service.builder.templates import ProjectBlueprint
from agent_service.models.agent_spec import AgentSpec
from agent_service.sandbox.base import SandboxConfig
from agent_service.sandbox.manager import SandboxManager

logger = logging.getLogger(__name__)


async def resolve_baseline_snapshot_id(
    *,
    user_id: str,
    agent_id: str,
    preferred_snapshot_id: str | None = None,
) -> str | None:
    if preferred_snapshot_id:
        return preferred_snapshot_id
    snaps = await list_snapshots(user_id=user_id, agent_id=agent_id)
    if not snaps:
        return None
    return str(snaps[0].get("id") or "") or None


async def _noop_emit(_type: str, _payload: dict[str, Any]) -> None:
    return None


async def restore_snapshot_to_workspace(
    *,
    manager: SandboxManager,
    user_id: str,
    snapshot_id: str,
    run_id: str,
) -> tuple[Any, list[dict[str, str]]]:
    """Create sandbox workspace and write snapshot files."""
    files_raw = await get_snapshot_files(user_id=user_id, snapshot_id=snapshot_id)
    files = [
        {"path": str(f["path"]), "content": str(f.get("content") or "")}
        for f in files_raw
        if f.get("path")
    ]
    handle = await manager.provider.create_workspace(SandboxConfig(command_timeout_seconds=120))
    for f in files:
        await manager.provider.write_file(handle, f["path"], f["content"])
    return handle, files


async def run_modify_or_repair_from_snapshot(
    *,
    user_id: str,
    agent_id: str,
    run_id: str,
    spec: AgentSpec,
    contract: RepairContract,
    blueprint: ProjectBlueprint,
    version_id: str | None = None,
    emit: Any | None = None,
) -> BuildReport:
    """MODIFY/REPAIR path: restore snapshot → verify → coding repair loop."""
    manager = SandboxManager()
    snapshot_id = await resolve_baseline_snapshot_id(
        user_id=user_id,
        agent_id=agent_id,
        preferred_snapshot_id=contract.baseline_snapshot_id,
    )
    if not snapshot_id:
        raise ValueError("REPAIR_REQUIRES_SNAPSHOT: no baseline project snapshot for this agent.")

    if emit:
        await emit("reproduction.started", {"snapshot_id": snapshot_id})

    handle, files = await restore_snapshot_to_workspace(
        manager=manager,
        user_id=user_id,
        snapshot_id=snapshot_id,
        run_id=run_id,
    )

    pipeline = CodeBuildPipeline(manager=manager, emit=emit if emit else _noop_emit)
    repair_objective = (
        f"REPAIR CONTRACT:\n{contract.model_dump_json()}\n\n"
        f"USER REQUEST:\n{contract.user_request}\n\n"
        f"Reported failure:\n{contract.reported_failure}\n\n"
        "Reproduce the failure, diagnose root cause, patch surgically, run tests+lint, "
        "and do not change protected scope."
    )
    report = await pipeline.build_from_workspace(
        handle=handle,
        blueprint=blueprint,
        files=files,
        user_id=user_id,
        agent_id=agent_id,
        run_id=run_id,
        version_id=version_id,
        scaffolded=False,
        repair_objective=repair_objective,
    )
    if emit:
        status = "succeeded" if report.success else "failed"
        await emit(f"reproduction.{status}", {"test_status": report.test_status})
    return report


def make_repair_contract_for_turn(
    *,
    user_request: str,
    spec: AgentSpec,
    failure_evidence: dict[str, Any] | None = None,
    explicit_user_tool_change: bool = False,
) -> RepairContract:
    from agent_service.builder.tool_review import reviewable_app_keys

    frozen = sorted(reviewable_app_keys(list(spec.tools or [])))
    reported = ""
    if failure_evidence:
        reported = str(
            failure_evidence.get("error_code")
            or failure_evidence.get("message")
            or failure_evidence.get("reason")
            or ""
        )
    return build_repair_contract(
        repair_id=str(uuid.uuid4()),
        user_request=user_request,
        original_goal=spec.goal or "",
        reported_failure=reported,
        failure_evidence=failure_evidence,
        frozen_app_keys=frozen,
        explicit_user_tool_change=explicit_user_tool_change,
    )
