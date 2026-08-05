"""Normalized tool-call schema for the generated-agent runtime."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class RuntimeToolCall(BaseModel):
    call_id: str = Field(min_length=1)
    tool_id: str = Field(min_length=1)
    arguments: dict[str, Any] = Field(default_factory=dict)


# OpenAI-style tool definitions for allowlisted MVP tools.
OPENAI_TOOL_SCHEMAS: dict[str, dict[str, Any]] = {
    "calculator": {
        "type": "function",
        "function": {
            "name": "calculator",
            "description": "Evaluate a basic arithmetic expression.",
            "parameters": {
                "type": "object",
                "properties": {"expression": {"type": "string"}},
                "required": ["expression"],
            },
        },
    },
    "current_datetime": {
        "type": "function",
        "function": {
            "name": "current_datetime",
            "description": "Return the current UTC date and time.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    "web_search": {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the public web for up-to-date information.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
        },
    },
    "fetch_url": {
        "type": "function",
        "function": {
            "name": "fetch_url",
            "description": "Fetch text content from a public HTTP(S) URL.",
            "parameters": {
                "type": "object",
                "properties": {"url": {"type": "string"}},
                "required": ["url"],
            },
        },
    },
    "knowledge_search": {
        "type": "function",
        "function": {
            "name": "knowledge_search",
            "description": "Search the agent's knowledge base.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
        },
    },
    "structured_output": {
        "type": "function",
        "function": {
            "name": "structured_output",
            "description": "Emit a structured JSON payload for the user.",
            "parameters": {
                "type": "object",
                "properties": {"payload": {"type": "object"}},
                "required": ["payload"],
            },
        },
    },
}


def schemas_for_tools(tool_ids: list[str]) -> list[dict[str, Any]]:
    return [OPENAI_TOOL_SCHEMAS[t] for t in tool_ids if t in OPENAI_TOOL_SCHEMAS]
