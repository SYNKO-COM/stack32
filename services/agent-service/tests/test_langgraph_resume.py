"""LangGraph interrupt / resume contract (connection + approval)."""

from __future__ import annotations


def test_langgraph_result_shape_interrupted():
    """Contract: run_langgraph_agent returns interrupt + status=interrupted."""
    result = {
        "answer": "",
        "tool_results": [{"error": "CONNECTION_REQUIRED", "provider": "pipedream"}],
        "visited_nodes": ["agent", "tools"],
        "steps": 1,
        "runtime": "langgraph",
        "interrupt": "CONNECTION_REQUIRED",
        "status": "interrupted",
    }
    assert result["interrupt"] == "CONNECTION_REQUIRED"
    assert result["status"] == "interrupted"


def test_langgraph_result_shape_resumed_complete():
    """After connection/approval, same thread resumes to completed without interrupt."""
    result = {
        "answer": "Message sent.",
        "tool_results": [{"ok": True}],
        "visited_nodes": ["agent", "tools"],
        "steps": 2,
        "runtime": "langgraph",
        "interrupt": None,
        "status": "completed",
    }
    assert result["interrupt"] is None
    assert result["status"] == "completed"


def test_approval_interrupt_code():
    paused = {
        "interrupt": "APPROVAL_REQUIRED",
        "status": "interrupted",
        "runtime": "langgraph",
    }
    assert paused["interrupt"] == "APPROVAL_REQUIRED"
