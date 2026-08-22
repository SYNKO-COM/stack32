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
    failure_category: str | None = None
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
        repair_objective: str | None = None,
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
        # 5. Autonomous multi-iteration repair with model escalation.
        # Never stop on first failure — escalate Terra → Sol → Claude before surfacing.
        from agent_service.config import get_settings
        from agent_service.verifier import classify_failure
        from agent_service.verifier.classify import failure_fingerprint
        from agent_service.verifier.repair import RepairLoopController

        settings = get_settings()
        needs_repair = test_status != "passed" or lint_status != "passed"
        can_repair = repair_model_fn is not None or self.gateway is not None
        repair_controller = RepairLoopController(
            target_iterations=max(5, settings.MAX_REPAIR_ATTEMPTS),
            hard_max=max(8, settings.MAX_REPAIR_ATTEMPTS + 3),
        )
        prior_failures = 0
        last_fingerprint: str | None = None

        if needs_repair and can_repair:
            lesson_block = ""
            try:
                from agent_service.learning import (
                    format_lessons_for_prompt,
                    lessons_for_repair,
                    record_error_observation,
                )

                failure_excerpt0 = str(
                    test_result.get("stdout") or test_result.get("stderr") or ""
                )[:500]
                await record_error_observation(
                    error_code="SANDBOX_TESTS_FAILED" if test_status != "passed" else "SANDBOX_LINT_FAILED",
                    reason=failure_excerpt0 or f"tests={test_status} lint={lint_status}",
                    context={"agent_id": agent_id, "project": blueprint.name, "source": "coding_pipeline"},
                )
                lessons = await lessons_for_repair(
                    error_code="SANDBOX_TESTS_FAILED",
                    reason=failure_excerpt0,
                    limit=5,
                )
                extra = await lessons_for_repair(error_code="MODEL_PROVIDER_UNAVAILABLE", limit=2)
                lesson_block = format_lessons_for_prompt((lessons + extra)[:7])
            except Exception:  # noqa: BLE001
                logger.exception("coding_repair_lessons_load_failed")

            system_prompt = BUILDER_SYSTEM_PROMPT
            if lesson_block:
                system_prompt = f"{BUILDER_SYSTEM_PROMPT}\n\n{lesson_block}"

            from agent_service.security.llm_budget import llm_run_budget

            async with llm_run_budget(
                run_id=f"{run_id}:coding",
                user_id=user_id,
                agent_id=agent_id,
                max_calls=settings.MAX_LLM_CALLS_PER_CODING_REPAIR,
            ):
                while test_status != "passed" or lint_status != "passed":
                    failure_excerpt = str(
                        test_result.get("stdout")
                        or test_result.get("stderr")
                        or lint_result.get("stdout")
                        or lint_result.get("stderr")
                        or ""
                    )[:500]
                    error_code = (
                        "SANDBOX_TESTS_FAILED" if test_status != "passed" else "SANDBOX_LINT_FAILED"
                    )
                    try:
                        fingerprint = failure_fingerprint(
                            error_code,
                            signature=failure_excerpt,
                        )
                    except TypeError:
                        # Defensive: never let fingerprint plumbing abort the repair loop.
                        fingerprint = failure_fingerprint(error_code, signature=str(failure_excerpt)[:200])

                    category = classify_failure(error_code)
                    made_progress = (
                        last_fingerprint is not None and fingerprint != last_fingerprint
                    )
                    decision = repair_controller.decide(
                        category=category,
                        fingerprint=fingerprint,
                        made_progress=made_progress,
                    )
                    last_fingerprint = fingerprint

                    if decision.action == "stop":
                        stop_reason = decision.reason
                        await emit(
                            "builder.repair.exhausted",
                            {
                                "reason": decision.reason,
                                "iteration": decision.iteration,
                                "test_status": test_status,
                                "lint_status": lint_status,
                            },
                        )
                        break
                    if decision.action == "retry":
                        await emit(
                            "builder.repair.retry",
                            {"reason": decision.reason, "iteration": decision.iteration},
                        )
                        test_result = await registry.get("exec.run_tests").run(ctx, {})
                        test_status = "passed" if test_result.get("ok") else "failed"
                        lint_result = await registry.get("exec.run_lint").run(ctx, {})
                        lint_status = "passed" if lint_result.get("ok") else "failed"
                        continue

                    # Escalation: 1st Terra (patch), 2nd Sol (repair_hard), 3rd+ Claude (repair_expert).
                    iter_n = decision.iteration
                    if iter_n <= 1:
                        stage = "patch"
                    elif iter_n == 2:
                        stage = "repair_hard"
                    else:
                        stage = "repair_expert"

                    await emit(
                        "builder.repair.started",
                        {
                            "iteration": iter_n,
                            "stage": stage,
                            "prior_failures": prior_failures,
                            "test_status": test_status,
                            "lint_status": lint_status,
                        },
                    )
                    if stage != "patch":
                        await emit(
                            "builder.model.escalated",
                            {"iteration": iter_n, "stage": stage},
                        )

                    agent = CodingAgent(
                        provider=provider,
                        handle=handle,
                        engine=engine,
                        registry=registry,
                        gateway=self.gateway,
                        emit=emit,
                        max_turns=10,
                    )

                    base_objective = repair_objective or (
                        f"The project verification is failing "
                        f"(tests={test_status}, lint={lint_status}). "
                        f"Fix the code so pytest and ruff both pass.\n\nProject: {blueprint.name}"
                    )
                    stage_objective = (
                        f"{base_objective}\n\n"
                        f"REPAIR ITERATION {iter_n} / STAGE={stage}. "
                        f"Prior failures this loop: {prior_failures}. "
                        f"Use the smallest coherent patch; run targeted then full tests + lint."
                    )

                    # Inject stage into model_fn wrapper when using gateway path.
                    async def _stage_aware_decide(
                        messages,
                        tools,
                        *,
                        _stage=stage,
                        _iter=iter_n,
                        _priors=prior_failures,
                        _outer=repair_model_fn,
                    ):
                        if _outer is not None:
                            try:
                                return await _outer(
                                    messages,
                                    tools,
                                    stage=_stage,
                                    repair_attempt=_iter,
                                    prior_failures=_priors,
                                )
                            except TypeError:
                                return await _outer(messages, tools)
                        return await agent._decide(
                            messages,
                            tools,
                            stage=_stage,
                            repair_attempt=_iter,
                            prior_failures=_priors,
                        )

                    result = await agent.run(
                        stage_objective,
                        system_prompt=system_prompt,
                        model_fn=_stage_aware_decide if repair_model_fn is None else _stage_aware_decide,
                    )
                    repaired = repaired or result.success
                    stop_reason = result.stop_reason
                    if stop_reason in {"MODEL_PROVIDER_UNAVAILABLE", "MODEL_BUDGET_EXCEEDED"}:
                        category_stop = classify_failure(stop_reason)
                        if category_stop == "PROVIDER_TEMPORARY":
                            prior_failures += 1
                            continue
                        break

                    files = await self._read_all(provider, handle, [f["path"] for f in files])
                    test_result = await registry.get("exec.run_tests").run(ctx, {})
                    test_status = "passed" if test_result.get("ok") else "failed"
                    lint_result = await registry.get("exec.run_lint").run(ctx, {})
                    lint_status = "passed" if lint_result.get("ok") else "failed"
                    await emit(
                        "builder.repair.completed",
                        {
                            "iteration": iter_n,
                            "stage": stage,
                            "test_status": test_status,
                            "lint_status": lint_status,
                        },
                    )
                    if test_status == "passed" and lint_status == "passed":
                        stop_reason = "COMPLETED"
                        try:
                            from agent_service.learning import record_repair_lesson

                            await record_repair_lesson(
                                error_code=error_code,
                                reason=failure_excerpt or "sandbox verification failed",
                                context={
                                    "agent_id": agent_id,
                                    "project": blueprint.name,
                                    "source": "coding_pipeline",
                                    "stage": stage,
                                    "iteration": iter_n,
                                },
                                resolution={
                                    "stop_reason": stop_reason,
                                    "test_status": test_status,
                                    "lint_status": lint_status,
                                    "stage": stage,
                                },
                                resolution_summary=(
                                    f"Coding repair ({stage}, iter {iter_n}) fixed "
                                    f"{blueprint.name}"
                                ),
                            )
                        except Exception:  # noqa: BLE001
                            logger.exception("coding_repair_lesson_record_failed")
                        break
                    prior_failures += 1

            if test_status != "passed" or lint_status != "passed":
                try:
                    from agent_service.learning import record_error_observation, record_repair_lesson

                    code = stop_reason if stop_reason in {
                        "MODEL_PROVIDER_UNAVAILABLE",
                        "MODEL_BUDGET_EXCEEDED",
                    } else "SANDBOX_REPAIR_FAILED"
                    await record_error_observation(
                        error_code=code,
                        reason=stop_reason,
                        context={
                            "agent_id": agent_id,
                            "project": blueprint.name,
                            "stop_reason": stop_reason,
                            "iterations": repair_controller.iteration,
                        },
                    )
                    if code in {"MODEL_PROVIDER_UNAVAILABLE", "MODEL_BUDGET_EXCEEDED"}:
                        await record_repair_lesson(
                            error_code=code,
                            reason=stop_reason,
                            context={"source": "coding_pipeline", "project": blueprint.name},
                            resolution={
                                "prefer_models": [
                                    "openai/gpt-5.6-terra",
                                    "openai/gpt-5.6-sol",
                                    "anthropic/claude-sonnet-5",
                                ],
                                "fallback_profile": "coding",
                                "avoid_models": ["openai/gpt-5.1-codex"],
                            },
                            resolution_summary=(
                                "Escalate Terra → Sol → Claude Sonnet 5 for coding repairs; "
                                "never downgrade to balanced chat."
                            ),
                        )
                except Exception:  # noqa: BLE001
                    logger.exception("coding_repair_failure_lesson_failed")

        success = test_status == "passed" and lint_status == "passed"
        structure = sorted(f["path"] for f in files)

        # Classify a terminal failure so callers/readiness can react (repairable vs
        # provider-temporary vs user-action) instead of showing a generic error.
        failure_category: str | None = None
        if not success:
            from agent_service.verifier import classify_failure

            failure_category = classify_failure(
                stop_reason if stop_reason != "COMPLETED" else "SANDBOX_TESTS_FAILED"
            )

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
            snapshot=snapshot, repaired=repaired, stop_reason=stop_reason,
            failure_category=failure_category, events=events,
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
