"""Agent readiness evaluator tests."""

from __future__ import annotations

from agent_service.models.agent_spec import ToolBinding, load_agent_spec
from agent_service.models.graph_spec import default_linear_graph
from agent_service.readiness import evaluate_agent_readiness


def _spec(*tool_ids: str, connection_requirements: list | None = None):
    tools = [ToolBinding(tool_id=t, provider="native") for t in tool_ids]
    # Use a minimal graph without tool nodes so GraphSpec does not constrain catalog ids.
    graph = default_linear_graph([]).model_dump()
    raw = {
        "schema_version": "4.0",
        "identity": {"name": "Ready Agent", "role": "Assistant"},
        "goal": "Be ready",
        "instructions": {"system": "Help."},
        "tools": [t.model_dump() for t in tools],
        "graph": graph,
        "connection_requirements": connection_requirements or [],
        "approvals": {"require_for_side_effects": True, "require_for_email_send": True},
    }
    return load_agent_spec(raw)


async def test_readiness_ready_for_native_only(monkeypatch):
    async def _no_conns(*, user_id: str):
        return []

    from agent_service.connections import manager as mgr_mod

    monkeypatch.setattr(mgr_mod.ConnectionManager, "list_connections", _no_conns)
    result = await evaluate_agent_readiness(
        agent_id="a1",
        user_id="u1",
        spec=_spec("web_search", "calculator"),
        build_ok=True,
    )
    assert result.status == "ready"
    assert all(c.ok or c.severity == "info" for c in result.checks if c.key != "approval_policy")


async def test_readiness_needs_setup_for_gmail(monkeypatch):
    async def _no_conns(*, user_id: str):
        return []

    from agent_service.connections import manager as mgr_mod

    monkeypatch.setattr(mgr_mod.ConnectionManager, "list_connections", _no_conns)
    result = await evaluate_agent_readiness(
        agent_id="a1",
        user_id="u1",
        spec=_spec(
            "gmail_list",
            connection_requirements=[
                {
                    "provider": "google",
                    "app_id": "google",
                    "tool_ids": ["gmail_list"],
                    "required": True,
                }
            ],
        ),
        build_ok=True,
    )
    assert result.status == "needs_setup"
    assert result.missing_connections
    assert any(c.key == "connections" and not c.ok for c in result.checks)


async def test_readiness_build_failed():
    result = await evaluate_agent_readiness(
        agent_id="a1",
        user_id="u1",
        spec=_spec("calculator"),
        build_ok=False,
    )
    assert result.status == "needs_attention"
    assert any(c.key == "build_ok" and not c.ok for c in result.checks)


async def test_readiness_unresolved_tool():
    result = await evaluate_agent_readiness(
        agent_id="a1",
        user_id="u1",
        spec=_spec("totally_unknown_tool_xyz"),
        build_ok=True,
    )
    assert result.status == "needs_attention"
    assert any(c.key == "tools_resolve" and not c.ok for c in result.checks)
