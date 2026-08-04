"""AgentSpec: the declarative description of a Stack32 agent."""

from typing import Any, Literal

from pydantic import BaseModel, Field

ToolName = Literal[
    "web_search",
    "fetch_url",
    "knowledge_search",
    "calculator",
    "current_datetime",
    "structured_output",
    "http_request",
]


class ModelProfile(BaseModel):
    profile: Literal["fast", "standard", "heavy"] = "standard"
    temperature: float = Field(default=0.4, ge=0.0, le=2.0)


class ToolConfig(BaseModel):
    tool: ToolName
    enabled: bool = True
    config: dict[str, Any] = Field(default_factory=dict)


class KnowledgeConfig(BaseModel):
    enabled: bool = False
    source_ids: list[str] = Field(default_factory=list)


class MemoryConfig(BaseModel):
    conversation_window: int = Field(default=12, ge=1, le=100)


class RuntimeLimits(BaseModel):
    max_steps: int = Field(default=8, ge=1, le=50)
    timeout_seconds: int = Field(default=60, ge=5, le=600)
    max_tool_calls: int = Field(default=6, ge=0, le=50)


class OutputConfig(BaseModel):
    format: Literal["markdown", "table", "text"] = "markdown"
    allow_tables: bool = True


class AgentSpec(BaseModel):
    """Versioned, declarative specification of an agent."""

    schema_version: str = "1.0"
    name: str = Field(min_length=1, max_length=120)
    slug: str
    goal: str
    instructions: str
    model_profile: ModelProfile = Field(default_factory=ModelProfile)
    tools: list[ToolConfig] = Field(default_factory=list)
    knowledge: KnowledgeConfig = Field(default_factory=KnowledgeConfig)
    memory: MemoryConfig = Field(default_factory=MemoryConfig)
    rules: list[str] = Field(default_factory=list)
    output: OutputConfig = Field(default_factory=OutputConfig)
    starter_prompts: list[str] = Field(default_factory=list)
    runtime: RuntimeLimits = Field(default_factory=RuntimeLimits)
