"""Tests for LangGraph generated-agent runtime and conversation context."""

from __future__ import annotations

import asyncio

from agent_service.compiler.graph_compiler import compile_graph, run_compiled_graph
from agent_service.gateway.model_gateway import ModelGateway, ModelProfile
from agent_service.models.agent_spec import (
    AgentIdentity,
    AgentInstructions,
    AgentSpec,
    ModelPolicy,
    ToolBinding,
)
from agent_service.models.graph_spec import GraphEdge, GraphNode, GraphSpec, default_linear_graph
from agent_service.runtime.tool_schema import schemas_for_tools


def _minimal_spec(*tools: str) -> AgentSpec:
    bindings = [ToolBinding(tool_id=t, enabled=True) for t in tools]  # type: ignore[arg-type]
    return AgentSpec(
        identity=AgentIdentity(name="Calc", role="Math helper"),
        goal="Calculate",
        instructions=AgentInstructions(system="You are a calculator assistant."),
        model_policy=ModelPolicy(profile="fast"),
        tools=bindings,
        graph=default_linear_graph(list(tools)),
    )


async def test_mock_gateway_emits_calculator_tool_call(monkeypatch):
    monkeypatch.setenv("AI_EXECUTION_MODE", "mock")
    from agent_service.config import get_settings

    get_settings.cache_clear()
    gw = ModelGateway()
    tools = schemas_for_tools(["calculator"])
    result = await gw.complete(
        profile=ModelProfile.FAST,
        messages=[{"role": "user", "content": "What is 12+30?"}],
        tools=tools,
    )
    assert result.tool_calls
    assert result.tool_calls[0]["tool_id"] == "calculator"
    get_settings.cache_clear()


async def test_langgraph_calculator_loop(monkeypatch):
    monkeypatch.setenv("AI_EXECUTION_MODE", "mock")
    monkeypatch.setenv("AGENT_RUNTIME_VERSION", "langgraph")
    from agent_service.config import get_settings

    get_settings.cache_clear()

    class FakeDb:
        async def _select(self, *_a, **_k):
            return []

        async def emit_event(self, *_a, **_k):
            return None

    from agent_service.runtime.langgraph_runtime import run_langgraph_agent

    out = await run_langgraph_agent(
        db=FakeDb(),  # type: ignore[arg-type]
        run_id="run-1",
        user_id="user-1",
        agent_id="agent-1",
        thread_id="thread-1",
        content="Compute 7+5",
        spec=_minimal_spec("calculator"),
        user_creds=("openai", "sk-test-key-not-real"),
    )
    assert out["runtime"] == "langgraph"
    assert out["tool_results"], "expected calculator tool execution"
    assert out["answer"]
    get_settings.cache_clear()


def test_parallel_fanout_visits_multiple_tools():
    graph = GraphSpec(
        entry_node_id="in",
        nodes=[
            GraphNode(id="in", type="input", name="in"),
            GraphNode(id="t1", type="tool", name="t1", config={"tool_id": "current_datetime"}),
            GraphNode(id="t2", type="tool", name="t2", config={"tool_id": "calculator"}),
            GraphNode(id="out", type="output", name="out"),
        ],
        edges=[
            GraphEdge(id="e1", source="in", target="t1"),
            GraphEdge(id="e2", source="in", target="t2"),
            GraphEdge(id="e3", source="t1", target="out"),
            GraphEdge(id="e4", source="t2", target="out"),
        ],
    )
    spec = AgentSpec(
        identity=AgentIdentity(name="A", role="R"),
        goal="g",
        instructions=AgentInstructions(system="s"),
        tools=[
            ToolBinding(tool_id="current_datetime", enabled=True),
            ToolBinding(tool_id="calculator", enabled=True),
        ],
        graph=graph,
    )
    compiled = compile_graph(spec)
    state = asyncio.run(
        run_compiled_graph(
            compiled,
            {
                "user_id": "u",
                "agent_id": "a",
                "input": "x",
                "tool_args": {"expression": "1+1"},
                "max_tool_calls": 4,
            },
            max_steps=10,
        )
    )
    visited = state.get("visited_nodes") or []
    assert "t1" in visited and "t2" in visited


def test_checkpoint_url_does_not_encode_plus_search_path():
    from agent_service.runtime.langgraph_runtime import _with_checkpoint_search_path

    scoped = _with_checkpoint_search_path("postgresql://u:p@localhost:5432/db")
    assert "+search_path" not in scoped
    assert "search_path" in scoped
    assert "-csearch_path=" in scoped or "-c%20search_path=" not in scoped
