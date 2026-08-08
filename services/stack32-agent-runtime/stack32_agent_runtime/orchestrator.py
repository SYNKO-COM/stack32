"""Deterministic orchestrator for generated agents (playbook §22-25).

The orchestrator — not the model — controls the loop: it decides the model
profile, validates structured tool calls, enforces security + approvals +
budgets, executes tools, returns observations, and terminates. Provider-native
structured tool calling. No private chain-of-thought is persisted.
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from stack32_agent_runtime.budgets import BudgetExceeded, RuntimeLimits
from stack32_agent_runtime.model import ModelAdapter
from stack32_agent_runtime.security import PolicyViolation, SecurityPolicy
from stack32_agent_runtime.state import AgentState, Message, ToolCallRecord
from stack32_agent_runtime.tools import ToolRegistry
from stack32_agent_runtime.tracing import Tracer

Approver = Callable[[str, dict[str, Any]], Awaitable[bool]]


@dataclass
class OrchestratorConfig:
    system_prompt: str = "You are a helpful assistant."
    limits: RuntimeLimits = field(default_factory=RuntimeLimits)
    policy: SecurityPolicy = field(default_factory=SecurityPolicy)


class Orchestrator:
    def __init__(
        self,
        *,
        model: ModelAdapter,
        tools: ToolRegistry,
        config: OrchestratorConfig | None = None,
        tracer: Tracer | None = None,
        approver: Approver | None = None,
    ) -> None:
        self.model = model
        self.tools = tools
        self.config = config or OrchestratorConfig()
        self.tracer = tracer or Tracer()
        self.approver = approver

    async def run(self, objective: str, *, state: AgentState | None = None) -> AgentState:
        state = state or AgentState()
        state.objective = objective
        if not state.messages:
            state.add_message(Message(role="system", content=self.config.system_prompt))
            state.add_message(Message(role="user", content=objective))

        await self.tracer.emit("agent.run.started", {"objective": objective[:200]})
        schemas = self.tools.schemas()

        while not state.terminal:
            try:
                self.config.limits.enforce(
                    turns=state.turn_count,
                    tool_calls=state.tool_call_count,
                    cost_usd=state.cost_usd,
                )
            except BudgetExceeded as exc:
                state.terminal = True
                state.stop_reason = exc.reason
                await self.tracer.emit("agent.run.stopped", {"reason": exc.reason})
                return state

            state.turn_count += 1
            state.model_call_count += 1
            await self.tracer.emit("agent.model.call", {"turn": state.turn_count})
            response = await self.model.call(
                [m.model_dump(exclude_none=True) for m in state.messages], schemas
            )
            state.cost_usd += response.cost_usd

            if not response.tool_calls:
                state.final_output = response.content
                state.terminal = True
                state.stop_reason = "COMPLETED"
                state.add_message(Message(role="assistant", content=response.content))
                await self.tracer.emit("agent.run.completed", {})
                return state

            state.add_message(
                Message(
                    role="assistant",
                    content=response.content or "",
                    tool_calls=[
                        {
                            "id": c.get("call_id", f"call_{i}"),
                            "type": "function",
                            "function": {
                                "name": c.get("tool_id") or c.get("name", ""),
                                "arguments": json.dumps(c.get("arguments", {})),
                            },
                        }
                        for i, c in enumerate(response.tool_calls)
                    ],
                )
            )

            for i, call in enumerate(response.tool_calls):
                name = str(call.get("tool_id") or call.get("name") or "")
                call_id = str(call.get("call_id") or f"call_{i}")
                args = call.get("arguments") or {}
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except json.JSONDecodeError:
                        args = {}
                observation = await self._dispatch(state, name, args)
                state.tool_calls.append(ToolCallRecord(call_id=call_id, name=name, arguments=args))
                state.add_observation(call_id, observation)
                state.add_message(
                    Message(role="tool", tool_call_id=call_id, name=name, content=json.dumps(observation)[:8000])
                )

        return state

    async def _dispatch(self, state: AgentState, name: str, args: dict[str, Any]) -> dict[str, Any]:
        spec = self.tools.get(name)
        if spec is None:
            return {"error": "TOOL_NOT_FOUND", "tool": name}
        try:
            self.config.policy.authorize(name)
        except PolicyViolation as exc:
            await self.tracer.emit("agent.tool.denied", {"tool": name, "code": exc.code})
            return {"error": exc.code, "message": str(exc)}

        required = spec.input_schema.get("required", [])
        missing = [k for k in required if k not in args]
        if missing:
            return {"error": "TOOL_SCHEMA", "missing": missing}

        if self.config.policy.requires_approval(name, side_effect=spec.side_effect, risk=spec.risk):
            approved = False
            if self.approver is not None:
                approved = await self.approver(name, args)
            await self.tracer.emit(
                "agent.tool.approval", {"tool": name, "approved": approved}
            )
            if not approved:
                return {"error": "APPROVAL_REQUIRED", "tool": name}

        await self.tracer.emit("agent.tool.call", {"tool": name})
        state.tool_call_count += 1
        try:
            result = await spec.fn(args)
        except Exception as exc:  # noqa: BLE001
            await self.tracer.emit("agent.tool.error", {"tool": name})
            return {"error": "TOOL_RUNTIME", "message": str(exc)[:300]}
        await self.tracer.emit("agent.tool.result", {"tool": name})
        return result
