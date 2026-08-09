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

try:
    from stack32_agent_runtime import __version__ as RUNTIME_VERSION
except ImportError:  # pragma: no cover - platform packaging gap
    RUNTIME_VERSION = "0.0.0-missing"

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

if RUNTIME_VERSION == "0.0.0-missing":
    logger.error(
        "stack32_agent_runtime is not installed; sandbox coding pipeline cannot run. "
        "Install with: pip install ../stack32-agent-runtime"
    )

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
            failure_excerpt = str(test_result.get("stdout") or test_result.get("stderr") or "")[:500]
            lesson_block = ""
            try:
                from agent_service.learning import (
                    format_lessons_for_prompt,
                    lessons_for_repair,
                    record_error_observation,
                )

                await record_error_observation(
                    error_code="SANDBOX_TESTS_FAILED",
                    reason=failure_excerpt or "sandbox tests failed",
                    context={"agent_id": agent_id, "project": blueprint.name, "source": "coding_pipeline"},
                )
                lessons = await lessons_for_repair(
                    error_code="SANDBOX_TESTS_FAILED",
                    reason=failure_excerpt,
                    limit=5,
                )
                # Also pull provider/budget lessons so the repair model avoids known traps.
                extra = await lessons_for_repair(error_code="MODEL_PROVIDER_UNAVAILABLE", limit=2)
                lessons = (lessons + extra)[:7]
                lesson_block = format_lessons_for_prompt(lessons)
            except Exception:  # noqa: BLE001
                logger.exception("coding_repair_lessons_load_failed")

            system_prompt = BUILDER_SYSTEM_PROMPT
            if lesson_block:
                system_prompt = f"{BUILDER_SYSTEM_PROMPT}\n\n{lesson_block}"

            agent = CodingAgent(
                provider=provider, handle=handle, engine=engine,
                registry=registry, gateway=self.gateway, emit=emit, max_turns=10,
            )
            from agent_service.config import get_settings
            from agent_service.security.llm_budget import llm_run_budget

            settings = get_settings()
            async with llm_run_budget(
                run_id=f"{run_id}:coding",
                user_id=user_id,
                agent_id=agent_id,
                max_calls=settings.MAX_LLM_CALLS_PER_CODING_REPAIR,
            ):
                result = await agent.run(
                    f"The project tests are failing. Fix the code so `pytest` passes.\n\nProject: {blueprint.name}",
                    system_prompt=system_prompt,
                    model_fn=repair_model_fn,
                )
            repaired = result.success
            stop_reason = result.stop_reason
            test_status = result.ledger.verification.get("tests", test_status)
            # Re-read files after repair.
            files = await self._read_all(provider, handle, [f["path"] for f in files])
            if repaired and test_status == "passed":
                try:
                    from agent_service.learning import record_repair_lesson

                    await record_repair_lesson(
                        error_code="SANDBOX_TESTS_FAILED",
                        reason=failure_excerpt or "sandbox tests failed",
                        context={
                            "agent_id": agent_id,
                            "project": blueprint.name,
                            "source": "coding_pipeline",
                        },
                        resolution={"stop_reason": stop_reason, "test_status": test_status},
                        resolution_summary=(
                            f"Coding repair fixed failing tests for {blueprint.name}"
                        ),
                    )
                except Exception:  # noqa: BLE001
                    logger.exception("coding_repair_lesson_record_failed")
            elif not repaired:
                try:
                    from agent_service.learning import record_error_observation, record_repair_lesson

                    code = stop_reason if stop_reason in {
                        "MODEL_PROVIDER_UNAVAILABLE",
                        "MODEL_BUDGET_EXCEEDED",
                    } else "SANDBOX_REPAIR_FAILED"
                    await record_error_observation(
                        error_code=code,
                        reason=failure_excerpt or stop_reason,
                        context={
                            "agent_id": agent_id,
                            "project": blueprint.name,
                            "stop_reason": stop_reason,
                        },
                    )
                    if code in {"MODEL_PROVIDER_UNAVAILABLE", "MODEL_BUDGET_EXCEEDED"}:
                        await record_repair_lesson(
                            error_code=code,
                            reason=failure_excerpt or stop_reason,
                            context={"source": "coding_pipeline", "project": blueprint.name},
                            resolution={
                                "prefer_models": ["openai/gpt-4.1", "openai/gpt-4.1-mini"],
                                "fallback_profile": "balanced",
                                "avoid_models": ["openai/gpt-5.1-codex"],
                            },
                            resolution_summary=(
                                "Use gpt-4.1 / balanced profile for coding repairs; "
                                "skip dead coding model ids; keep a dedicated repair budget."
                            ),
                        )
                except Exception:  # noqa: BLE001
                    logger.exception("coding_repair_failure_lesson_failed")

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
