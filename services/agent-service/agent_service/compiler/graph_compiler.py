"""Secure GraphCompiler — maps GraphSpec to trusted LangGraph callables."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from agent_service.models.agent_spec import TRUSTED_TOOL_IDS, AgentSpec
from agent_service.models.graph_spec import GraphSpec

NodeHandler = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]


class GraphCompileError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


@dataclass
class CompiledGraph:
    """Trusted compiled representation — never evaluates model-supplied code."""

    entry_node_id: str
    handlers: dict[str, NodeHandler]
    adjacency: dict[str, list[tuple[str, dict[str, Any] | None]]]
    node_meta: dict[str, dict[str, Any]] = field(default_factory=dict)
    spec_hash: str = ""


async def _passthrough(state: dict[str, Any]) -> dict[str, Any]:
    return state


def _make_llm_handler(config: dict[str, Any]) -> NodeHandler:
    async def handler(state: dict[str, Any]) -> dict[str, Any]:
        state = dict(state)
        state["llm_profile"] = config.get("profile", "balanced")
        state["steps"] = int(state.get("steps", 0)) + 1
        return state

    return handler


def _make_tool_handler(tool_id: str) -> NodeHandler:
    async def handler(state: dict[str, Any]) -> dict[str, Any]:
        from agent_service.tools.runtime import execute_tool

        state = dict(state)
        # Structural smoke tests walk tool nodes without executing them.
        if state.get("test_marker") and int(state.get("max_tool_calls", 6)) == 0:
            state.setdefault("tool_results", []).append(
                {"tool_id": tool_id, "result": {"skipped": True, "reason": "smoke_test"}}
            )
            return state
        calls = int(state.get("tool_calls", 0))
        if calls >= int(state.get("max_tool_calls", 6)):
            state["error"] = "TOOL_FAILED"
            return state
        args = state.get("tool_args") or {}
        # Linear GraphSpec may include tool nodes for Structure visualization.
        # Only execute when the runtime supplies concrete arguments (LLM tool call).
        if not args:
            return state
        result = await execute_tool(tool_id, args, context=state)
        state["tool_calls"] = calls + 1
        state["last_tool_result"] = result
        state.setdefault("tool_results", []).append({"tool_id": tool_id, "result": result})
        return state

    return handler


def _make_knowledge_handler() -> NodeHandler:
    async def handler(state: dict[str, Any]) -> dict[str, Any]:
        from agent_service.knowledge.retrieve import retrieve_knowledge

        state = dict(state)
        query = str(state.get("input") or state.get("query") or "")
        chunks = await retrieve_knowledge(
            user_id=str(state["user_id"]),
            agent_id=str(state["agent_id"]),
            query=query,
            max_chunks=int(state.get("max_chunks", 8)),
            min_similarity=float(state.get("min_similarity", 0.7)),
        )
        state["knowledge_chunks"] = chunks
        return state

    return handler


def _make_memory_read_handler() -> NodeHandler:
    async def handler(state: dict[str, Any]) -> dict[str, Any]:
        from agent_service.memory.service import read_memories

        state = dict(state)
        memories = await read_memories(
            user_id=str(state["user_id"]),
            agent_id=str(state["agent_id"]),
            query=str(state.get("input") or ""),
        )
        state["memories"] = memories
        return state

    return handler


def _make_memory_write_handler() -> NodeHandler:
    async def handler(state: dict[str, Any]) -> dict[str, Any]:
        from agent_service.memory.service import maybe_write_memory

        state = dict(state)
        await maybe_write_memory(state)
        return state

    return handler


def _make_approval_handler() -> NodeHandler:
    async def handler(state: dict[str, Any]) -> dict[str, Any]:
        state = dict(state)
        state["approval_required"] = True
        state["interrupt"] = "approval"
        return state

    return handler


HANDLER_FACTORIES: dict[str, Callable[[dict[str, Any]], NodeHandler]] = {
    "input": lambda _c: _passthrough,
    "guardrail": lambda _c: _passthrough,
    "llm": _make_llm_handler,
    "router": lambda _c: _passthrough,
    "transform": lambda _c: _passthrough,
    "output": lambda _c: _passthrough,
    "sub_agent": lambda _c: _passthrough,
    "knowledge": lambda _c: _make_knowledge_handler(),
    "memory_read": lambda _c: _make_memory_read_handler(),
    "memory_write": lambda _c: _make_memory_write_handler(),
    "approval": lambda _c: _make_approval_handler(),
}


def compile_graph(spec: AgentSpec | GraphSpec, *, agent_spec: AgentSpec | None = None) -> CompiledGraph:
    """Compile a GraphSpec into trusted handlers. Never eval/import dynamic code."""
    graph = spec.graph if isinstance(spec, AgentSpec) else spec
    agent = agent_spec if isinstance(spec, GraphSpec) else spec
    # Re-validate
    GraphSpec.model_validate(graph.model_dump())

    allowed_tools = {t.tool_id for t in (agent.tools if agent else []) if t.enabled}
    handlers: dict[str, NodeHandler] = {}
    meta: dict[str, dict[str, Any]] = {}

    for node in graph.nodes:
        if node.type == "tool":
            tool_id = node.config.get("tool_id")
            if tool_id not in TRUSTED_TOOL_IDS:
                raise GraphCompileError("TOOL_NOT_ALLOWED", f"Unknown tool {tool_id}")
            if allowed_tools and tool_id not in allowed_tools:
                raise GraphCompileError(
                    "TOOL_NOT_ALLOWED",
                    f"Tool {tool_id} not bound on AgentSpec",
                )
            handlers[node.id] = _make_tool_handler(str(tool_id))
        else:
            factory = HANDLER_FACTORIES.get(node.type)
            if factory is None:
                raise GraphCompileError("GRAPH_COMPILE_FAILED", f"Unsupported node type {node.type}")
            handlers[node.id] = factory(node.config)
        meta[node.id] = {
            "type": node.type,
            "name": node.name,
            "description": node.description,
        }

    adjacency: dict[str, list[tuple[str, dict[str, Any] | None]]] = {n.id: [] for n in graph.nodes}
    for edge in graph.edges:
        cond = edge.condition.model_dump() if edge.condition else None
        adjacency[edge.source].append((edge.target, cond))

    return CompiledGraph(
        entry_node_id=graph.entry_node_id,
        handlers=handlers,
        adjacency=adjacency,
        node_meta=meta,
        spec_hash=str(hash(graph.model_dump_json())),
    )


async def run_compiled_graph(
    compiled: CompiledGraph,
    initial_state: dict[str, Any],
    *,
    max_steps: int = 8,
) -> dict[str, Any]:
    """Execute a compiled graph with hard step bounds."""
    state = dict(initial_state)
    current = compiled.entry_node_id
    steps = 0
    visited_path: list[str] = []

    while current and steps < max_steps:
        handler = compiled.handlers[current]
        state = await handler(state)
        visited_path.append(current)
        state["visited_nodes"] = visited_path
        if state.get("interrupt"):
            break
        meta = compiled.node_meta[current]
        if meta["type"] == "output":
            break
        next_nodes = compiled.adjacency.get(current) or []
        if not next_nodes:
            break
        # Simple router: take first matching edge (always / truthy)
        chosen = None
        for target, cond in next_nodes:
            if cond is None or cond.get("type") == "always":
                chosen = target
                break
            path = cond.get("path")
            expected = cond.get("value")
            actual = state.get(path) if path else None
            ctype = cond.get("type")
            if ctype == "equals" and actual == expected:
                chosen = target
                break
            if ctype == "truthy" and actual:
                chosen = target
                break
            if ctype == "falsy" and not actual:
                chosen = target
                break
        current = chosen or next_nodes[0][0]
        steps += 1
        state["steps"] = steps

    if steps >= max_steps and compiled.node_meta.get(current, {}).get("type") != "output":
        state["warning"] = "max_steps_reached"
    return state
