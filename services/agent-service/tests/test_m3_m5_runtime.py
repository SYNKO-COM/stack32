"""Tests for M3–M5: project files, V3 migrator, exclusive queue, PKCE helpers."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from agent_service.builder.project_files import build_project_artifacts
from agent_service.connections.manager import _pkce_pair, scopes_for_tools
from agent_service.mock_data import make_sales_research_spec
from agent_service.models.agent_spec import AgentSpec, migrate_v2_to_v3
from agent_service.models.failure_report import failure_from_smoke
from agent_service.models.graph_spec import default_linear_graph


def test_project_artifacts_paths():
    spec = make_sales_research_spec()
    arts = build_project_artifacts(spec)
    paths = {a["path"] for a in arts}
    assert paths == {"agent.json", "graph.json", "tools.json"}


def test_migrate_v2_to_v3_additive():
    spec = make_sales_research_spec()
    v3 = migrate_v2_to_v3(spec)
    assert v3.schema_version == "3.0"
    assert v3.connection_requirements == []
    assert v3.approvals.require_for_side_effects is True
    # round-trip
    assert AgentSpec.model_validate(v3.model_dump()).schema_version == "3.0"


def test_failure_report_suggests_patches():
    report = failure_from_smoke(status="failed", reason="GRAPH_COMPILE_FAILED", input_text="x")
    kinds = {p.kind for p in report.suggested_patches}
    assert "reset_linear_graph" in kinds


def test_pkce_pair_shape():
    verifier, challenge = _pkce_pair()
    assert len(verifier) > 20
    assert len(challenge) > 20
    assert "=" not in challenge


def test_google_scopes_include_gmail():
    scopes = scopes_for_tools(["gmail_list", "calendar_list"])
    assert any("gmail" in s for s in scopes)
    assert any("calendar" in s for s in scopes)


@pytest.mark.asyncio
async def test_dispatch_inline_skips_enqueue(monkeypatch):
    from agent_service.queue import dispatch as dispatch_mod

    monkeypatch.setattr(
        dispatch_mod,
        "get_settings",
        lambda: MagicMock(QUEUE_INLINE=True),
    )
    db = MagicMock()
    db.enqueue_run = AsyncMock()
    executed = AsyncMock(return_value={"status": "ok"})
    result = await dispatch_mod.dispatch_run(
        db=db, run_id="r1", user_id="u1", execute=executed
    )
    assert result["status"] == "ok"
    db.enqueue_run.assert_not_called()
    executed.assert_awaited_once()


@pytest.mark.asyncio
async def test_dispatch_queue_skips_execute(monkeypatch):
    from agent_service.queue import dispatch as dispatch_mod

    monkeypatch.setattr(
        dispatch_mod,
        "get_settings",
        lambda: MagicMock(QUEUE_INLINE=False),
    )
    db = MagicMock()
    db.enqueue_run = AsyncMock()
    executed = AsyncMock(return_value={"status": "ok"})
    result = await dispatch_mod.dispatch_run(
        db=db, run_id="r1", user_id="u1", execute=executed
    )
    assert result["status"] == "queued"
    db.enqueue_run.assert_awaited_once()
    executed.assert_not_called()


def test_default_linear_still_shallow():
    graph = default_linear_graph()
    assert graph.entry_node_id == "input"
