"""Persisted entities: agents, versions, runs and run events."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from agent_service.models.agent_spec import AgentSpec

AgentStatus = Literal["draft", "building", "ready", "needs_attention", "published"]
VersionStatus = Literal["draft", "published", "archived"]
RunKind = Literal["build", "live", "test", "repair", "ingestion"]
RunStatus = Literal["queued", "running", "succeeded", "failed"]


class Agent(BaseModel):
    id: str
    name: str
    status: AgentStatus
    created_at: datetime
    updated_at: datetime


class AgentVersion(BaseModel):
    id: str
    agent_id: str
    version_number: int = Field(ge=1)
    spec: AgentSpec
    status: VersionStatus
    created_at: datetime


class Run(BaseModel):
    id: str
    agent_id: str
    kind: RunKind
    status: RunStatus
    created_at: datetime


class RunEvent(BaseModel):
    id: str
    run_id: str
    type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
