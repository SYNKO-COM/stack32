"""Real code build pipeline (M-F).

Generates a real agent project in an isolated sandbox from a blueprint, writes
files, runs real verification (pytest + ruff), repairs failures via the coding
loop when a model is available, and records an immutable snapshot. Emits real
`builder.*` operational events throughout.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from stack32_agent_runtime import __version__ as RUNTIME_VERSION

from agent_service.builder.coding.agent import CodingAgent, ModelFn
from agent_service.builder.coding.prompts import BUILDER_SYSTEM_PROMPT
from agent_service.builder.coding.tools import ToolContext, build_registry
from agent_service.builder.context.engine import ContextEngine
from agent_service.builder.projects import create_snapshot, ensure_project
from agent_service.builder.templates import ProjectBlueprint, render_agent_project
from agent_service.gateway.model_gateway import ModelGateway
from agent_service.sandbox.base import SandboxProvider, WorkspaceHandle
from agent_service.sandbox.manager import SandboxManager

logger = logging.getLogger(__name__)

EmitFn = Callable[[str, dict[str, Any]], Awaitable[None]]


async def _noop_emit(_t: str, _p: dict[str, Any]) -> None:
    return None


@dataclass
class BuildReport:
    success: bool
    handle: WorkspaceHandle
    files: list[dict[str, str]]
    structure: list[str]
    test_status: str
    lint_status: str
    test_output: str
    snapshot: dict[str, Any] | None = None
    repaired: bool = False
    stop_reason: str = "COMPLETED"
    events: list[str] = field(default_factory=list)


class CodeBuildPipeline:
    def __init__(
        self,
        *,
        manager: SandboxManager | None = None,
        provider: SandboxProvider | None = None,
        gateway: ModelGateway | None = None,
        emit: EmitFn | None = None,
    ) -> None:
        self.manager = manager
        self.provider = provider
        self.gateway = gateway or ModelGateway()
        self.emit = emit or _noop_emit

    def _provider(self) -> SandboxProvider:
        if self.manager is not None:
            return self.manager.provider
        if self.provider is not None:
            return self.provider
        raise ValueError("CodeBuildPipeline requires a manager or provider")

    async def build(
        self,
        blueprint: ProjectBlueprint,
        *,
        user_id: str,
        agent_id: str,
        run_id: str,
        version_id: str | None = None,
        repair_model_fn: ModelFn | None = None,
        persist: bool = True,
    ) -> BuildReport:
        provider = self._provider()
        # 1. Isolated workspace.
        if self.manager is not None:
            handle = await self.manager.ensure_workspace(user_id=user_id, agent_id=agent_id, run_id=run_id)
        else:
            from agent_service.sandbox.base import SandboxConfig

            handle = await provider.create_workspace(SandboxConfig(command_timeout_seconds=60))

        # 2. Scaffold + write real project files.
        files = render_agent_project(blueprint)
        for f in files:
            await provider.write_file(handle, f["path"], f["content"])

        return await self.build_from_workspace(
            handle=handle, blueprint=blueprint, files=files,
            user_id=user_id, agent_id=agent_id, run_id=run_id,
            version_id=version_id, repair_model_fn=repair_model_fn, persist=persist,
            scaffolded=True,
        )

    async def build_from_workspace(
        self,
        *,
        handle: WorkspaceHandle,
        blueprint: ProjectBlueprint,
        files: list[dict[str, str]],
        user_id: str,
        agent_id: str,
        run_id: str,
        version_id: str | None = None,
        repair_model_fn: ModelFn | None = None,
        persist: bool = True,
        scaffolded: bool = False,
    ) -> BuildReport:
        events: list[str] = []

        async def emit(evt: str, payload: dict[str, Any]) -> None:
            events.append(evt)
            await self.emit(evt, payload)

        provider = self._provider()
        await emit("builder.run.started", {"objective": blueprint.description[:200]})
        await emit("builder.sandbox.ready", {"provider": provider.name})
        await emit("builder.project.scaffolding", {"pattern": blueprint.resolved_pattern()})
        for f in files:
            await emit("builder.file.created", {"path": f["path"]})

        # 3. Index the project.
        engine = ContextEngine(provider, handle, gateway=self.gateway)
        await emit("builder.context.indexing", {})
        await engine.build()

        # 4. Verify (real pytest + ruff).
        registry = build_registry()
        ctx = ToolContext(provider, handle, engine)
        await emit("builder.tests.started", {})
        test_result = await registry.get("exec.run_tests").run(ctx, {})
        test_status = "passed" if test_result.get("ok") else "failed"
        await emit(f"builder.tests.{'passed' if test_result.get('ok') else 'failed'}", {
            "exit_code": test_result.get("exit_code"),
        })
        lint_result = await registry.get("exec.run_lint").run(ctx, {})
        lint_status = "passed" if lint_result.get("ok") else "failed"

        repaired = False
        stop_reason = "COMPLETED"
        # 5. Repair loop when tests fail and a model is available.
        if test_status == "failed" and (repair_model_fn is not None or self.gateway):
            await emit("builder.repair.started", {})
            agent = CodingAgent(
                provider=provider, handle=handle, engine=engine,
                registry=registry, gateway=self.gateway, emit=emit, max_turns=10,
            )
            result = await agent.run(
                f"The project tests are failing. Fix the code so `pytest` passes.\n\nProject: {blueprint.name}",
                system_prompt=BUILDER_SYSTEM_PROMPT,
                model_fn=repair_model_fn,
            )
            repaired = result.success
            stop_reason = result.stop_reason
            test_status = result.ledger.verification.get("tests", test_status)
            # Re-read files after repair.
            files = await self._read_all(provider, handle, [f["path"] for f in files])

        success = test_status == "passed"
        structure = sorted(f["path"] for f in files)

        # 6. Immutable snapshot.
        snapshot = None
        sandbox_snap = None
        if self.manager is not None and success:
            try:
                sandbox_snap = await self.manager.snapshot(handle, run_id=run_id)
            except Exception:  # noqa: BLE001
                sandbox_snap = None
        if persist and success:
            project = await ensure_project(
                user_id=user_id, agent_id=agent_id,
                runtime_version=RUNTIME_VERSION, pattern=blueprint.resolved_pattern(),
            )
            if project:
                snapshot = await create_snapshot(
                    user_id=user_id, agent_id=agent_id, project_id=project["id"],
                    version_id=version_id, sandbox_snapshot_id=sandbox_snap,
                    manifest={
                        "name": blueprint.name,
                        "pattern": blueprint.resolved_pattern(),
                        "runtime_version": RUNTIME_VERSION,
                        "tools": [t.name for t in blueprint.tools],
                    },
                    test_status=test_status, lint_status=lint_status, files=files,
                )
                if snapshot:
                    await emit("builder.snapshot.created", {"snapshot_number": snapshot.get("snapshot_number")})

        await emit("builder.ready" if success else "builder.run.stopped", {"test_status": test_status})
        return BuildReport(
            success=success, handle=handle, files=files, structure=structure,
            test_status=test_status, lint_status=lint_status,
            test_output=str(test_result.get("stdout", ""))[:4000],
            snapshot=snapshot, repaired=repaired, stop_reason=stop_reason, events=events,
        )

    @staticmethod
    async def _read_all(
        provider: SandboxProvider, handle: WorkspaceHandle, paths: list[str]
    ) -> list[dict[str, str]]:
        out: list[dict[str, str]] = []
        for p in paths:
            try:
                content = await provider.read_file(handle, p)
            except Exception:  # noqa: BLE001
                continue
            out.append({"path": p, "content": content, "content_type": "text/plain"})
        return out
