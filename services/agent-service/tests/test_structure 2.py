"""M-H: executable structure derived from the real generated project."""

from __future__ import annotations

from agent_service.builder.structure import derive_structure

_MANIFEST = {
    "name": "Appointment Agent",
    "pattern": "reactive",
    "runtime_version": "0.1.0",
    "tools": [
        {"name": "gmail_send", "side_effect": True},
        {"name": "calendar_list", "side_effect": False},
    ],
}

_FILES = [
    {"path": "agent.yaml"},
    {"path": "src/agent/main.py"},
    {"path": "src/agent/orchestrator.py"},
    {"path": "src/agent/prompts.py"},
    {"path": "src/agent/security.py"},
    {"path": "src/agent/tools.py"},
    {"path": "src/agent/memory.py"},
    {"path": "tests/test_agent.py"},
]


def _node(structure, node_id):
    return next(n for n in structure["nodes"] if n["id"] == node_id)


def test_structure_maps_nodes_to_files():
    structure = derive_structure(_MANIFEST, _FILES)
    assert _node(structure, "orchestrator")["file"] == "src/agent/orchestrator.py"
    assert _node(structure, "orchestrator")["config"]["pattern"] == "reactive"
    assert _node(structure, "manifest")["file"] == "agent.yaml"
    # entrypoint -> orchestrator edge exists
    assert {"source": "entrypoint", "target": "orchestrator"} in structure["edges"]


def test_tool_nodes_and_side_effect_flag():
    structure = derive_structure(_MANIFEST, _FILES)
    send = _node(structure, "tool:gmail_send")
    assert send["config"]["side_effect"] is True
    assert send["file"] == "src/agent/tools.py"
    assert {"source": "tools", "target": "tool:gmail_send"} in structure["edges"]


def test_bindings_attached_to_tool_nodes():
    bindings = [
        {"tool_ids": ["gmail_send"], "connection_id": "conn-1", "provider": "google", "enabled": True}
    ]
    structure = derive_structure(_MANIFEST, _FILES, bindings=bindings)
    send = _node(structure, "tool:gmail_send")
    assert send["binding"]["connection_id"] == "conn-1"
    assert send["binding"]["provider"] == "google"
    # unbound tool has no binding
    assert _node(structure, "tool:calendar_list")["binding"] is None


def test_missing_files_prune_nodes():
    partial = [{"path": "agent.yaml"}, {"path": "src/agent/main.py"}]
    structure = derive_structure(_MANIFEST, partial)
    ids = {n["id"] for n in structure["nodes"] if not n["id"].startswith("tool:")}
    assert ids == {"manifest", "entrypoint"}
    # no dangling edges to pruned nodes
    for edge in structure["edges"]:
        if not edge["target"].startswith("tool:"):
            assert edge["source"] in ids and edge["target"] in ids
