"""Tests for stack32-agent-runtime."""

from __future__ import annotations

from stack32_agent_runtime import (
    AgentNeeds,
    Orchestrator,
    OrchestratorConfig,
    RuntimeLimits,
    SecurityPolicy,
    ToolRegistry,
    ToolSpec,
    select_pattern,
)
from stack32_agent_runtime.model import ModelResponse


class ScriptedModel:
    def __init__(self, script):
        self.script = script
        self.i = 0

    async def call(self, messages, tools):
        resp = self.script[self.i]
        self.i += 1
        return resp


def _registry():
    reg = ToolRegistry()

    async def add(args):
        return {"result": args["a"] + args["b"]}

    reg.register(
        ToolSpec(
            name="add",
            description="Add two numbers",
            input_schema={"type": "object", "properties": {"a": {"type": "number"}, "b": {"type": "number"}}, "required": ["a", "b"]},
            fn=add,
        )
    )
    return reg


async def test_reactive_tool_loop():
    model = ScriptedModel([
        ModelResponse(tool_calls=[{"call_id": "1", "tool_id": "add", "arguments": {"a": 2, "b": 3}}]),
        ModelResponse(content="The sum is 5."),
    ])
    orch = Orchestrator(model=model, tools=_registry())
    state = await orch.run("add 2 and 3")
    assert state.terminal
    assert state.stop_reason == "COMPLETED"
    assert state.final_output == "The sum is 5."
    assert state.observations[0].content == {"result": 5}


async def test_tool_not_allowed_by_policy():
    model = ScriptedModel([
        ModelResponse(tool_calls=[{"call_id": "1", "tool_id": "add", "arguments": {"a": 1, "b": 1}}]),
        ModelResponse(content="done"),
    ])
    config = OrchestratorConfig(policy=SecurityPolicy(allowed_tools={"other"}))
    orch = Orchestrator(model=model, tools=_registry(), config=config)
    state = await orch.run("x")
    assert state.observations[0].content["error"] == "TOOL_NOT_ALLOWED"


async def test_budget_turn_limit():
    # Model never finishes; limit should stop it.
    model = ScriptedModel([
        ModelResponse(tool_calls=[{"call_id": str(i), "tool_id": "add", "arguments": {"a": 1, "b": 1}}])
        for i in range(50)
    ])
    config = OrchestratorConfig(limits=RuntimeLimits(max_turns=3, max_tool_calls=100))
    orch = Orchestrator(model=model, tools=_registry(), config=config)
    state = await orch.run("loop")
    assert state.stop_reason == "TURN_LIMIT_REACHED"


async def test_approval_required_blocks_side_effect():
    reg = ToolRegistry()

    async def send(args):
        return {"sent": True}

    reg.register(
        ToolSpec(
            name="send_email",
            description="send",
            input_schema={"type": "object", "properties": {"to": {"type": "string"}}, "required": ["to"]},
            fn=send,
            risk="high",
            side_effect=True,
        )
    )
    model = ScriptedModel([
        ModelResponse(tool_calls=[{"call_id": "1", "tool_id": "send_email", "arguments": {"to": "x@y.z"}}]),
        ModelResponse(content="stopped"),
    ])
    config = OrchestratorConfig(policy=SecurityPolicy(approvals={"send_email": "always"}))
    orch = Orchestrator(model=model, tools=reg, config=config)  # no approver -> denied
    state = await orch.run("email someone")
    assert state.observations[0].content["error"] == "APPROVAL_REQUIRED"


def test_pattern_router():
    assert select_pattern(AgentNeeds(tool_count=0)) == "simple_tool"
    assert select_pattern(AgentNeeds(tool_count=1)) == "reactive"
    assert select_pattern(AgentNeeds(tool_count=6)) == "plan_execute"
    assert select_pattern(AgentNeeds(is_event_driven=True)) == "event_worker"
    assert select_pattern(AgentNeeds(tool_count=10, distinct_domains=3)) == "multi_agent"
