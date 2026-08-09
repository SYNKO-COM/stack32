import pytest

from agent_service.compiler.graph_compiler import GraphCompileError, compile_graph
from agent_service.mock_data import make_sales_research_spec
from agent_service.models.graph_spec import GraphEdge, GraphNode, GraphSpec


def test_compile_valid_spec():
    spec = make_sales_research_spec()
    compiled = compile_graph(spec)
    assert compiled.entry_node_id == "input"
    assert "output" in compiled.handlers


def test_reject_empty_tool_node_id():
    nodes = [
        GraphNode(id="input", type="input", name="In"),
        GraphNode(
            id="evil",
            type="tool",
            name="Evil",
            config={"tool_id": ""},
        ),
        GraphNode(id="output", type="output", name="Out"),
    ]
    edges = [
        GraphEdge(id="e1", source="input", target="evil"),
        GraphEdge(id="e2", source="evil", target="output"),
    ]
    with pytest.raises(ValueError):
        GraphSpec(entry_node_id="input", nodes=nodes, edges=edges)


def test_reject_executable_config():
    with pytest.raises(ValueError):
        GraphNode(
            id="x",
            type="llm",
            name="Bad",
            config={"code": "print('hi')"},
        )


def test_compile_rejects_unbound_tool():
    from agent_service.models.agent_spec import (
        AgentIdentity,
        AgentInstructions,
        AgentSpec,
        ToolBinding,
    )
    from agent_service.models.graph_spec import default_linear_graph

    tools = [ToolBinding(tool_id="calculator")]
    # Graph references web_search not bound
    graph = default_linear_graph([ToolBinding(tool_id="web_search")])
    spec = AgentSpec(
        identity=AgentIdentity(name="A", role="R"),
        goal="G",
        instructions=AgentInstructions(system="S"),
        tools=tools,
        graph=graph,
    )
    with pytest.raises(GraphCompileError):
        compile_graph(spec)


def test_default_linear_graph_many_tools_stays_shallow():
    from agent_service.models.agent_spec import ToolBinding
    from agent_service.models.graph_spec import default_linear_graph

    tools = [
        ToolBinding(tool_id="current_datetime"),
        ToolBinding(tool_id="structured_output"),
        ToolBinding(tool_id="web_search"),
        ToolBinding(tool_id="fetch_url"),
        ToolBinding(tool_id="knowledge_search"),
        ToolBinding(tool_id="calculator"),
    ]
    graph = default_linear_graph(tools)
    assert graph.entry_node_id == "input"
    assert any(n.id == "output" for n in graph.nodes)
    assert len([n for n in graph.nodes if n.type == "tool"]) == 6
