"""Derive an executable structure graph from a generated agent project (M-H).

Unlike the legacy GraphSpec-derived view, this reflects the *real* code the
Builder produced. Every node points at a concrete source file and, where
relevant, its configuration and connector binding — so the UI can offer
"Open file / View code" and show which connection a tool is bound to.
"""

from __future__ import annotations

from typing import Any

# Canonical files emitted by the scaffold, mapped to structure node metadata.
_FILE_NODES: list[dict[str, str]] = [
    {"id": "manifest", "label": "agent.yaml", "type": "manifest", "file": "agent.yaml"},
    {"id": "entrypoint", "label": "main", "type": "entrypoint", "file": "src/agent/main.py"},
    {"id": "orchestrator", "label": "orchestrator", "type": "orchestrator", "file": "src/agent/orchestrator.py"},
    {"id": "prompts", "label": "prompts", "type": "prompts", "file": "src/agent/prompts.py"},
    {"id": "security", "label": "security", "type": "security", "file": "src/agent/security.py"},
    {"id": "tools", "label": "tools", "type": "tool_registry", "file": "src/agent/tools.py"},
    {"id": "memory", "label": "memory", "type": "memory", "file": "src/agent/memory.py"},
    {"id": "tests", "label": "tests", "type": "tests", "file": "tests/test_agent.py"},
]

_EDGES: list[dict[str, str]] = [
    {"source": "entrypoint", "target": "orchestrator"},
    {"source": "orchestrator", "target": "prompts"},
    {"source": "orchestrator", "target": "security"},
    {"source": "orchestrator", "target": "tools"},
    {"source": "orchestrator", "target": "memory"},
]


def derive_structure(
    manifest: dict[str, Any] | None,
    files: list[dict[str, Any]] | None,
    *,
    bindings: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build a node/edge graph reflecting the real project.

    - `manifest`: snapshot manifest (name, pattern, runtime_version, tools).
    - `files`: [{path, ...}] present in the snapshot (drives node existence).
    - `bindings`: [{tool_ids: [...], connection_id, provider}] to attach to tools.
    """
    manifest = manifest or {}
    present_paths = {f.get("path") for f in (files or [])}
    binding_by_tool = _index_bindings(bindings or [])

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, str]] = []

    pattern = manifest.get("pattern")
    runtime_version = manifest.get("runtime_version")

    for spec in _FILE_NODES:
        # Only surface nodes whose file actually exists in the snapshot (when we
        # have file info); otherwise assume the canonical layout.
        if present_paths and spec["file"] not in present_paths:
            continue
        node: dict[str, Any] = {
            "id": spec["id"],
            "label": spec["label"],
            "type": spec["type"],
            "file": spec["file"],
            "config": {},
        }
        if spec["id"] == "orchestrator":
            node["config"] = {"pattern": pattern, "runtime_version": runtime_version}
        if spec["id"] == "manifest":
            node["config"] = {"name": manifest.get("name"), "pattern": pattern}
        nodes.append(node)

    node_ids = {n["id"] for n in nodes}
    for edge in _EDGES:
        if edge["source"] in node_ids and edge["target"] in node_ids:
            edges.append(dict(edge))

    # Tool child nodes (one per manifest tool), bound to their source file and
    # any connector binding the agent owns.
    if "tools" in node_ids:
        for tool in manifest.get("tools", []) or []:
            tool_name = tool if isinstance(tool, str) else tool.get("name")
            if not tool_name:
                continue
            side_effect = tool.get("side_effect", False) if isinstance(tool, dict) else False
            binding = binding_by_tool.get(tool_name)
            tool_node = {
                "id": f"tool:{tool_name}",
                "label": tool_name,
                "type": "tool",
                "file": "src/agent/tools.py",
                "config": {"side_effect": bool(side_effect)},
                "binding": binding,
            }
            nodes.append(tool_node)
            edges.append({"source": "tools", "target": tool_node["id"]})

    return {
        "nodes": nodes,
        "edges": edges,
        "source": "project",
        "pattern": pattern,
        "runtime_version": runtime_version,
    }


def _index_bindings(bindings: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for b in bindings:
        info = {
            "connection_id": b.get("connection_id"),
            "provider": b.get("provider"),
            "enabled": b.get("enabled", True),
        }
        for tid in b.get("tool_ids", []) or []:
            out[tid] = info
    return out
