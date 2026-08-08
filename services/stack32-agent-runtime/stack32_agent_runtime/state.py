"""Typed runtime state for generated agents (playbook §26)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

Role = Literal["system", "user", "assistant", "tool"]


class Message(BaseModel):
    role: Role
    content: str = ""
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)
    tool_call_id: str | None = None
    name: str | None = None


class ToolCallRecord(BaseModel):
    call_id: str
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class Observation(BaseModel):
    call_id: str
    content: Any


class AgentState(BaseModel):
    run_id: str = ""
    user_id: str = ""
    agent_id: str = ""
    agent_version_id: str = ""

    objective: str = ""
    messages: list[Message] = Field(default_factory=list)

    tool_calls: list[ToolCallRecord] = Field(default_factory=list)
    observations: list[Observation] = Field(default_factory=list)

    turn_count: int = 0
    tool_call_count: int = 0
    model_call_count: int = 0

    cost_usd: float = 0.0
    started_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    terminal: bool = False
    final_output: str | None = None
    stop_reason: str | None = None

    def add_message(self, message: Message) -> None:
        self.messages.append(message)

    def add_observation(self, call_id: str, content: Any) -> None:
        self.observations.append(Observation(call_id=call_id, content=content))
