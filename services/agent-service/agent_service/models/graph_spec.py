"""GraphSpec — declarative execution graph independent of React Flow."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

GraphNodeType = Literal[
    "input",
    "guardrail",
    "llm",
    "router",
    "tool",
    "knowledge",
    "memory_read",
    "memory_write",
    "approval",
    "transform",
    "output",
    "sub_agent",
]

MAX_NODES = 40
MAX_SUB_AGENTS = 3
MAX_BRANCH_DEPTH = 8


class PositionHint(BaseModel):
    x: float = 0
    y: float = 0


class EdgeCondition(BaseModel):
    type: Literal["always", "equals", "not_equals", "truthy", "falsy"] = "always"
    path: str | None = None
    value: Any = None


class GraphNode(BaseModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_\-]+$")
    type: GraphNodeType
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    config: dict[str, Any] = Field(default_factory=dict)
    position_hint: PositionHint | None = None

    @field_validator("config")
    @classmethod
    def _reject_executable_config(cls, value: dict[str, Any]) -> dict[str, Any]:
        banned = {"code", "python", "shell", "eval", "exec", "import", "module_path", "entrypoint"}
        if banned.intersection(value.keys()):
            raise ValueError("Graph node config contains banned executable keys.")
        # Reject obvious code strings
        for k, v in value.items():
            if isinstance(v, str) and ("__import__" in v or "subprocess" in v or "os.system" in v):
                raise ValueError(f"Unsafe content in config.{k}")
        return value


class GraphEdge(BaseModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_\-]+$")
    source: str = Field(min_length=1, max_length=64)
    target: str = Field(min_length=1, max_length=64)
    condition: EdgeCondition | None = None
    label: str | None = Field(default=None, max_length=120)


class GraphSpec(BaseModel):
    version: Literal["1.0"] = "1.0"
    entry_node_id: str
    nodes: list[GraphNode] = Field(min_length=2, max_length=MAX_NODES)
    edges: list[GraphEdge] = Field(default_factory=list, max_length=80)

    @model_validator(mode="after")
    def _validate_graph(self) -> GraphSpec:
        ids = [n.id for n in self.nodes]
        if len(ids) != len(set(ids)):
            raise ValueError("Graph node IDs must be unique.")
        id_set = set(ids)
        if self.entry_node_id not in id_set:
            raise ValueError("entry_node_id must reference an existing node.")
        entry = next(n for n in self.nodes if n.id == self.entry_node_id)
        if entry.type != "input":
            raise ValueError("Entry node must be of type input.")

        for edge in self.edges:
            if edge.source not in id_set or edge.target not in id_set:
                raise ValueError(f"Edge {edge.id} references missing nodes.")

        outputs = [n for n in self.nodes if n.type == "output"]
        if not outputs:
            raise ValueError("Graph must contain at least one output node.")

        # Reachability from entry
        adj: dict[str, list[str]] = {i: [] for i in id_set}
        for e in self.edges:
            adj[e.source].append(e.target)
        seen: set[str] = set()
        stack = [self.entry_node_id]
        while stack:
            cur = stack.pop()
            if cur in seen:
                continue
            seen.add(cur)
            stack.extend(adj.get(cur, []))
        if not any(n.id in seen for n in outputs):
            raise ValueError("No output node is reachable from the entry node.")

        sub_agents = [n for n in self.nodes if n.type == "sub_agent"]
        if len(sub_agents) > MAX_SUB_AGENTS:
            raise ValueError(f"At most {MAX_SUB_AGENTS} sub-agents are allowed.")
        for sa in sub_agents:
            if sa.config.get("allow_nested_sub_agents"):
                raise ValueError("Recursive sub-agents are not allowed.")

        # Tool nodes must reference a non-empty tool_id (registry validates at readiness).
        for n in self.nodes:
            if n.type == "tool":
                tool_id = n.config.get("tool_id")
                if tool_id is None or not isinstance(tool_id, str) or not tool_id.strip():
                    raise ValueError(f"Tool node {n.id} missing tool_id.")
                if len(tool_id) > 128:
                    raise ValueError(f"Tool node {n.id} tool_id too long.")

        _check_branch_depth(adj, self.entry_node_id, MAX_BRANCH_DEPTH)
        return self


def _check_branch_depth(adj: dict[str, list[str]], start: str, max_depth: int) -> None:
    stack: list[tuple[str, int, frozenset[str]]] = [(start, 0, frozenset({start}))]
    while stack:
        node, depth, path = stack.pop()
        if depth > max_depth:
            raise ValueError(f"Graph exceeds maximum branch depth ({max_depth}).")
        for nxt in adj.get(node, []):
            if nxt in path:
                # Cycles only allowed for router loops with explicit condition — keep bounded.
                continue
            stack.append((nxt, depth + 1, path | {nxt}))


def default_linear_graph(
    tools: list[Any] | None = None,
    *,
    knowledge_enabled: bool = False,
    memory_enabled: bool = False,
) -> GraphSpec:
    """Create a safe shallow graph with optional memory/knowledge nodes.

    Layout: input → guard → [memory_read] → [knowledge] → llm → (tools*) → [memory_write] → output
    """
    nodes = [
        GraphNode(id="input", type="input", name="Input", description="User message"),
        GraphNode(id="guard", type="guardrail", name="Guardrails", description="Input safety"),
        GraphNode(
            id="llm",
            type="llm",
            name="Reason",
            description="Main model call",
            config={"profile": "balanced"},
        ),
        GraphNode(id="output", type="output", name="Output", description="Final answer"),
    ]
    edges: list[GraphEdge] = [
        GraphEdge(id="e1", source="input", target="guard"),
    ]
    cursor = "guard"
    if memory_enabled:
        nodes.append(
            GraphNode(id="memory_read", type="memory_read", name="Memory", description="Read memories")
        )
        edges.append(GraphEdge(id="e_mem_r", source=cursor, target="memory_read"))
        cursor = "memory_read"
    if knowledge_enabled:
        nodes.append(
            GraphNode(id="knowledge", type="knowledge", name="Knowledge", description="RAG retrieve")
        )
        edges.append(GraphEdge(id="e_know", source=cursor, target="knowledge"))
        cursor = "knowledge"
    edges.append(GraphEdge(id="e_llm", source=cursor, target="llm"))

    tool_nodes: list[str] = []
    if tools:
        for idx, binding in enumerate(tools[:6]):
            tool_id = getattr(binding, "tool_id", None) or (
                binding.get("tool_id") if isinstance(binding, dict) else None
            )
            if not tool_id:
                continue
            nid = f"tool_{idx}"
            tool_nodes.append(nid)
            nodes.append(
                GraphNode(
                    id=nid,
                    type="tool",
                    name=str(tool_id),
                    description=f"Tool {tool_id}",
                    config={"tool_id": tool_id},
                )
            )
            edges.append(GraphEdge(id=f"et{idx}", source="llm", target=nid))
            if memory_enabled:
                edges.append(GraphEdge(id=f"eto_mw{idx}", source=nid, target="memory_write"))
            else:
                edges.append(GraphEdge(id=f"eto{idx}", source=nid, target="output"))
    if memory_enabled:
        nodes.append(
            GraphNode(
                id="memory_write",
                type="memory_write",
                name="Remember",
                description="Write semantic memory",
            )
        )
        if not tool_nodes:
            edges.append(GraphEdge(id="e_mw", source="llm", target="memory_write"))
        edges.append(GraphEdge(id="e_out", source="memory_write", target="output"))
    elif not tool_nodes:
        edges.append(GraphEdge(id="e_out", source="llm", target="output"))
    return GraphSpec(entry_node_id="input", nodes=nodes, edges=edges)
