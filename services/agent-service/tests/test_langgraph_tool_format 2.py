"""Normalize LangGraph messages to OpenAI tool_call shape."""

from __future__ import annotations

from agent_service.runtime.langgraph_runtime import _to_provider_message


def test_compact_tool_calls_become_openai_shape():
    msg = {
        "role": "assistant",
        "content": "",
        "tool_calls": [
            {"call_id": "1", "tool_id": "web_search", "arguments": {"query": "acme"}}
        ],
    }
    out = _to_provider_message(msg)
    assert out["tool_calls"][0]["type"] == "function"
    assert out["tool_calls"][0]["id"] == "1"
    assert out["tool_calls"][0]["function"]["name"] == "web_search"
    assert "acme" in out["tool_calls"][0]["function"]["arguments"]


def test_already_provider_shaped_passthrough():
    msg = {
        "role": "assistant",
        "content": "hi",
        "tool_calls": [
            {
                "id": "c1",
                "type": "function",
                "function": {"name": "calculator", "arguments": '{"expression":"1+1"}'},
            }
        ],
    }
    out = _to_provider_message(msg)
    assert out["tool_calls"][0]["function"]["name"] == "calculator"


def test_tool_role_preserves_call_id():
    out = _to_provider_message(
        {"role": "tool", "content": "{}", "tool_call_id": "1", "name": "web_search"}
    )
    assert out["tool_call_id"] == "1"
    assert out["name"] == "web_search"
