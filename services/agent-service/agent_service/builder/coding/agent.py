"""Deterministic coding agent loop (M-C).

The orchestrator — not the LLM — owns the loop. The model proposes structured
tool calls; the orchestrator validates, permission-checks, executes them through
the sandbox, records observations, detects loops, and enforces verification
before accepting completion. Emits real `builder.*` operational events.

Canonical loop: gather -> (plan) -> act -> observe -> verify -> repair.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from agent_service.builder.coding.ledger import WorkLedger
from agent_service.builder.coding.loop_detection import LoopDetector
from agent_service.builder.coding.tools import CodingToolRegistry, ToolContext, build_registry
from agent_service.builder.context.engine import ContextEngine
from agent_service.gateway.model_gateway import ModelGateway, ModelProfile
from agent_service.sandbox.base import SandboxProvider, WorkspaceHandle

logger = logging.getLogger(__name__)

EmitFn = Callable[[str, dict[str, Any]], Awaitable[None]]
ModelFn = Callable[[list[dict[str, Any]], list[dict[str, Any]]], Awaitable["ModelDecision"]]

# Maps tool ids to user-facing operational event types (playbook §37).
_EVENT_BY_TOOL = {
    "workspace.read_file": "builder.file.read",
    "workspace.list_directory": "builder.context.searching",
    "workspace.grep": "builder.context.searching",
    "workspace.file_tree": "builder.context.searching",
    "workspace.create_file": "builder.file.created",
    "workspace.apply_patch": "builder.file.patch.completed",
    "workspace.delete_file": "builder.file.patch.completed",
    "code.find_symbol": "builder.context.searching",
    "code.get_diagnostics": "builder.security.check",
    "exec.run_command": "builder.command.completed",
    "exec.run_tests": "builder.tests.started",
    "exec.run_lint": "builder.security.check",
}


@dataclass
class ModelDecision:
    content: str
    tool_calls: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class CodingResult:
    success: bool
    final_message: str
    ledger: WorkLedger
    files_touched: list[str]
    stop_reason: str
    transcript: list[dict[str, Any]] = field(default_factory=list)


async def _noop_emit(_type: str, _payload: dict[str, Any]) -> None:  # pragma: no cover
    return None


class CodingAgent:
    def __init__(
        self,
        *,
        provider: SandboxProvider,
        handle: WorkspaceHandle,
        engine: ContextEngine,
        registry: CodingToolRegistry | None = None,
        gateway: ModelGateway | None = None,
        emit: EmitFn | None = None,
        max_turns: int = 12,
        max_verification_repairs: int = 3,
        tool_ids: list[str] | None = None,
    ) -> None:
        self.provider = provider
        self.handle = handle
        self.engine = engine
        self.registry = registry or build_registry()
        self.gateway = gateway or ModelGateway()
        self.emit = emit or _noop_emit
        self.max_turns = max_turns
        self.max_verification_repairs = max_verification_repairs
        self.tool_ids = tool_ids or self.registry.ids()

    async def _decide(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> ModelDecision:
        from agent_service.security.llm_budget import LlmCallBudgetExceeded

        try:
            result = await self.gateway.complete(
                profile=ModelProfile.CODING,
                messages=messages,
                tools=tools,
                max_tokens=2048,
                temperature=0.1,
            )
        except LlmCallBudgetExceeded:
            raise
        except Exception:
            # Specialized coding models may be unavailable — degrade to balanced chat.
            result = await self.gateway.complete(
                profile=ModelProfile.BALANCED,
                messages=messages,
                tools=tools,
                max_tokens=2048,
                temperature=0.1,
            )
        content = getattr(result, "content", None) or ""
        raw_calls = getattr(result, "tool_calls", None) or []
        tool_calls: list[dict[str, Any]] = []
        for call in raw_calls:
            if not isinstance(call, dict):
                continue
            tool_calls.append(
                {
                    "tool_id": str(call.get("tool_id") or call.get("name") or ""),
                    "call_id": str(call.get("call_id") or call.get("id") or ""),
                    "arguments": call.get("arguments") or {},
                }
            )
        return ModelDecision(content=str(content), tool_calls=tool_calls)

    async def run(
        self,
        objective: str,
        *,
        system_prompt: str,
        model_fn: ModelFn | None = None,
    ) -> CodingResult:
        ctx = ToolContext(self.provider, self.handle, self.engine)
        ledger = WorkLedger(objective=objective)
        detector = LoopDetector()
        decide = model_fn or self._decide

        # Plan & Execute skeleton — ReAct turns execute against this plan.
        ledger.set_plan(
            [
                "Inspect failing tests and relevant files",
                "Apply the smallest coherent fix",
                "Re-run verification (pytest)",
                "Self-check: stop only if tests pass",
            ]
        )

        await self.emit("builder.run.started", {"objective": objective[:200]})
        await self.emit(
            "builder.plan.created",
            {"steps": [s.title for s in ledger.plan], "pattern": "react"},
        )
        await self.emit("builder.context.indexing", {})
        await self.engine.build()
        retrieval = await self.engine.retrieve(objective)
        context_block = retrieval.render(self.engine.allocation())

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": (
                    f"OBJECTIVE:\n{objective}\n\n"
                    f"PROJECT CONTEXT (retrieved):\n{context_block[:8000]}\n\n"
                    "Use tools to inspect and edit real files. Run tests to verify. "
                    "When done and tests pass, reply with a short plain-text summary and no tool call."
                ),
            },
        ]
        schemas = self.registry.schemas_for(self.tool_ids)
        verification_repairs = 0

        while ledger.turn_count < self.max_turns:
            ledger.turn_count += 1
            await self.emit("builder.model.call", {"turn": ledger.turn_count})
            try:
                decision = await decide(messages, schemas)
            except Exception as exc:  # noqa: BLE001
                from agent_service.security.llm_budget import LlmCallBudgetExceeded

                logger.warning("coding model call failed: %s", exc)
                stop = (
                    "MODEL_BUDGET_EXCEEDED"
                    if isinstance(exc, LlmCallBudgetExceeded) or "BUDGET" in str(exc)
                    else "MODEL_PROVIDER_UNAVAILABLE"
                )
                return CodingResult(
                    success=False,
                    final_message="Model provider unavailable." if stop != "MODEL_BUDGET_EXCEEDED" else "LLM call budget exceeded during repair.",
                    ledger=ledger,
                    files_touched=sorted(ctx.files_touched),
                    stop_reason=stop,
                    transcript=messages,
                )

            if not decision.tool_calls:
                # Proposed completion — verify before accepting.
                if ledger.verification.get("tests") == "failed" and verification_repairs < self.max_verification_repairs:
                    verification_repairs += 1
                    messages.append({"role": "assistant", "content": decision.content})
                    messages.append({
                        "role": "user",
                        "content": "Tests are still failing. Inspect the failure and repair before finishing.",
                    })
                    continue
                await self.emit("builder.ready", ledger.summary())
                return CodingResult(
                    success=True, final_message=decision.content or "Done.",
                    ledger=ledger, files_touched=sorted(ctx.files_touched),
                    stop_reason="COMPLETED", transcript=messages,
                )

            # Record the assistant tool-call turn in OpenAI format.
            messages.append({
                "role": "assistant",
                "content": decision.content or "",
                "tool_calls": [
                    {
                        "id": c.get("call_id", f"call_{i}"),
                        "type": "function",
                        "function": {"name": c.get("tool_id", ""), "arguments": json.dumps(c.get("arguments", {}))},
                    }
                    for i, c in enumerate(decision.tool_calls)
                ],
            })

            files_before = set(ctx.files_touched)
            for i, call in enumerate(decision.tool_calls):
                tool_id = str(call.get("tool_id") or "")
                call_id = str(call.get("call_id") or f"call_{i}")
                args = call.get("arguments") or {}
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except json.JSONDecodeError:
                        args = {}
                observation = await self._execute(ctx, ledger, detector, tool_id, args)
                messages.append({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": json.dumps(observation)[:12_000],
                })

            files_changed = set(ctx.files_touched) != files_before
            reason = detector.reason()
            if reason:
                await self.emit("builder.repair.started", {"reason": reason})
                if not files_changed:
                    return CodingResult(
                        success=False, final_message="Stopped to avoid a loop.",
                        ledger=ledger, files_touched=sorted(ctx.files_touched),
                        stop_reason=reason, transcript=messages,
                    )

        await self.emit("builder.run.stopped", {"reason": "TURN_LIMIT"})
        return CodingResult(
            success=False, final_message="Reached the turn limit.",
            ledger=ledger, files_touched=sorted(ctx.files_touched),
            stop_reason="TURN_LIMIT_REACHED", transcript=messages,
        )

    async def _execute(
        self,
        ctx: ToolContext,
        ledger: WorkLedger,
        detector: LoopDetector,
        tool_id: str,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        tool = self.registry.get(tool_id)
        if tool is None:
            return {"error": "TOOL_NOT_ALLOWED", "tool": tool_id}
        # Basic schema validation: required properties present.
        required = tool.input_schema.get("required", [])
        missing = [k for k in required if k not in args]
        if missing:
            return {"error": "TOOL_SCHEMA", "missing": missing}
        if detector.repeated_call(tool_id, args):
            return {"error": "LOOP_DETECTED", "message": "Identical call repeated; change approach."}
        detector.observe_call(tool_id, args)
        ledger.tool_call_count += 1

        event = _EVENT_BY_TOOL.get(tool_id, "builder.tool.called")
        await self.emit(event, {"tool": tool_id, "args": _safe_args(args)})
        try:
            result = await tool.run(ctx, args)
        except Exception as exc:  # noqa: BLE001
            logger.warning("tool %s failed: %s", tool_id, exc)
            return {"error": "TOOL_RUNTIME", "tool": tool_id, "message": str(exc)[:300]}

        # Post-processing: ledger facts, touched files, verification status.
        if tool_id in ("workspace.create_file", "workspace.apply_patch", "workspace.delete_file"):
            path = str(args.get("path", ""))
            if path:
                ledger.touch(path)
        if tool_id == "exec.run_tests":
            ok = bool(result.get("ok"))
            ledger.verification["tests"] = "passed" if ok else "failed"
            await self.emit("builder.tests.passed" if ok else "builder.tests.failed", {
                "exit_code": result.get("exit_code"),
            })
            ledger.add_fact(f"Tests {'passed' if ok else 'failed'} (exit {result.get('exit_code')})")
        if tool_id == "exec.run_lint":
            ledger.verification["lint"] = "passed" if result.get("ok") else "failed"
        return result


def _safe_args(args: dict[str, Any]) -> dict[str, Any]:
    """Trim large fields from event payloads (never expose full file bodies)."""
    out: dict[str, Any] = {}
    for k, v in args.items():
        if isinstance(v, str) and len(v) > 120:
            out[k] = v[:120] + "…"
        else:
            out[k] = v
    return out
