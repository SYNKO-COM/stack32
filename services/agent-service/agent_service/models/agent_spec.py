"""AgentSpec V2–V4 — versioned declarative agent configuration."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from agent_service.models.graph_spec import GraphSpec

TrustedToolId = Literal[
    "web_search",
    "fetch_url",
    "knowledge_search",
    "calculator",
    "current_datetime",
    "structured_output",
]

# Built-in native tool ids (migration helpers + compiler allowlist baseline).
NATIVE_BUILTIN_TOOL_IDS: frozenset[str] = frozenset(
    {
        "web_search",
        "fetch_url",
        "knowledge_search",
        "calculator",
        "current_datetime",
        "structured_output",
        "gmail_list",
        "gmail_read",
        "gmail_send",
        "gmail_create_draft",
        "gmail_send_message",
        "calendar_list",
        "calendar_create_event",
        "http_request",
    }
)

# Backward-compatible alias.
TRUSTED_TOOL_IDS: frozenset[str] = NATIVE_BUILTIN_TOOL_IDS

# Hard cap on bound tools — single source of truth for builder resolution too.
MAX_AGENT_TOOLS = 40

ModelProfileName = Literal["fast", "balanced", "reasoning"]
ApprovalMode = Literal["never", "always", "conditional"]
WritePolicy = Literal["never", "explicit", "automatic"]


class AgentIdentity(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    role: str = Field(min_length=1, max_length=240)
    description: str = Field(default="", max_length=2000)
    tone: str = Field(default="professional", max_length=64)
    avatar_key: str | None = Field(default=None, max_length=120)


class AgentInstructions(BaseModel):
    system: str = Field(min_length=1, max_length=20000)
    behavioral_rules: list[str] = Field(default_factory=list, max_length=50)
    uncertainty_policy: str = Field(
        default="Ask clarifying questions when uncertain.",
        max_length=2000,
    )
    output_expectations: str = Field(default="", max_length=4000)
    prohibited_actions: list[str] = Field(default_factory=list, max_length=50)


class ModelPolicy(BaseModel):
    profile: ModelProfileName = "balanced"
    allow_fallback: bool = True
    max_input_tokens: int = Field(default=32000, ge=1024, le=200000)
    max_output_tokens: int = Field(default=4096, ge=256, le=32000)


# M1/M4: exact generated-agent model (BYOK). Distinct from the Builder's own LLM.
LLMProviderName = Literal[
    "openai",
    "anthropic",
    "google",
    "xai",
    "mistral",
    "groq",
    "openrouter",
]


class ModelConfig(BaseModel):
    """Exact model the *generated* agent runs on, with agent-scoped BYOK credentials.

    Legacy specs carry no ModelConfig; we never fabricate one — the agent is
    flagged ``needs_setup`` until the user selects a concrete provider/model.
    """

    provider: LLMProviderName | None = Field(default=None)
    model_id: str | None = Field(default=None, max_length=200)
    display_name: str | None = Field(default=None, max_length=200)
    # Generated agents MUST use their own key; platform fallback is never allowed.
    credential_scope: Literal["agent"] = "agent"
    fallback_enabled: Literal[False] = False
    # Optional dedicated embeddings model for Stack32 semantic memory (BYOK).
    embedding_provider: LLMProviderName | None = Field(default=None)
    embedding_model_id: str | None = Field(default=None, max_length=200)

    @property
    def is_configured(self) -> bool:
        return bool(self.provider and self.model_id)


class InputConfig(BaseModel):
    accept_files: bool = False
    accept_urls: bool = True
    max_message_chars: int = Field(default=8000, ge=100, le=100000)


class ToolBinding(BaseModel):
    """V4 tool binding — registry validates tool_id at readiness time."""

    tool_id: str = Field(min_length=1, max_length=128)
    provider: str = Field(default="native", min_length=1, max_length=64)
    app_id: str | None = Field(default=None, max_length=128)
    external_action_id: str | None = Field(default=None, max_length=256)
    version: str | None = Field(default=None, max_length=64)
    enabled: bool = True
    approval_mode: ApprovalMode = "never"
    config: dict[str, Any] = Field(default_factory=dict)
    connection_requirement_id: str | None = Field(default=None, max_length=64)

    @field_validator("config")
    @classmethod
    def _no_code_payloads(cls, value: dict[str, Any]) -> dict[str, Any]:
        banned = {"code", "python", "shell", "eval", "exec", "module"}
        if banned.intersection(value.keys()):
            raise ValueError("Tool config contains banned executable keys.")
        return value


class KnowledgeConfig(BaseModel):
    enabled: bool = False
    source_ids: list[str] = Field(default_factory=list, max_length=100)
    require_citations: bool = True
    max_chunks: int = Field(default=8, ge=1, le=32)
    min_similarity: float = Field(default=0.7, ge=0.0, le=1.0)


MemoryProviderName = Literal["stack32", "external_postgres"]


class MemoryConfig(BaseModel):
    # M3: memory provider selection. Default = Stack32 zero-config memory.
    provider: MemoryProviderName = "stack32"
    external_config_id: str | None = Field(default=None, max_length=64)
    # Pipedream app slug when provider=external_postgres (postgresql, supabase, …).
    external_app_id: str | None = Field(default=None, max_length=128)
    # Free-form instructions the Live agent must follow for the external DB.
    external_instructions: str | None = Field(default=None, max_length=4000)
    conversation_enabled: bool = True
    semantic_enabled: bool = False
    retention_days: int = Field(default=90, ge=1, le=3650)
    max_memory_items: int = Field(default=200, ge=0, le=5000)
    write_policy: WritePolicy = "explicit"
    conversation_window: int = Field(default=12, ge=1, le=100)

    def system_addon(self) -> str:
        """Extra system text when memory is backed by an external Pipedream database."""
        if self.provider != "external_postgres":
            return ""
        app = (self.external_app_id or "database").strip() or "database"
        bits = [
            f"External memory uses a Pipedream-connected database ({app}).",
            "You must configure and use that database yourself with the available tools.",
            "Do not invent rows or claim writes succeeded without calling a tool.",
        ]
        notes = (self.external_instructions or "").strip()
        if notes:
            bits.append(f"User instructions for this database:\n{notes}")
        return "\n".join(bits)


class AgentRule(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    text: str = Field(min_length=1, max_length=2000)
    priority: int = Field(default=100, ge=0, le=1000)


class OutputConfig(BaseModel):
    format: Literal["markdown", "table", "text", "json"] = "markdown"
    allow_tables: bool = True
    allow_citations: bool = True


class RuntimeLimits(BaseModel):
    max_steps: int = Field(default=8, ge=1, le=50)
    max_model_calls: int = Field(default=12, ge=1, le=100)
    max_tool_calls: int = Field(default=6, ge=0, le=50)
    timeout_seconds: int = Field(default=60, ge=5, le=600)
    max_repair_attempts: int = Field(default=2, ge=0, le=2)


class AgentSecurityPolicy(BaseModel):
    treat_external_content_as_untrusted: bool = True
    require_citations_for_retrieval: bool = True
    approval_required_for_side_effects: bool = True
    allowed_domains: list[str] = Field(default_factory=list, max_length=100)
    blocked_domains: list[str] = Field(default_factory=list, max_length=100)


class ConnectionRequirement(BaseModel):
    id: str | None = Field(default=None, max_length=64)
    provider: str = Field(min_length=1, max_length=64)
    app_id: str | None = Field(default=None, max_length=128)
    auth_type: str = Field(default="oauth2", max_length=32)
    tool_ids: list[str] = Field(default_factory=list, max_length=40)
    required_for: list[str] = Field(default_factory=list, max_length=40)
    required: bool = True

    @model_validator(mode="after")
    def _sync_tool_lists(self) -> ConnectionRequirement:
        if not self.tool_ids and self.required_for:
            self.tool_ids = list(self.required_for)
        elif not self.required_for and self.tool_ids:
            self.required_for = list(self.tool_ids)
        return self


class ConnectionBindingRef(BaseModel):
    connection_id: str = Field(min_length=1, max_length=64)
    tool_ids: list[str] = Field(default_factory=list, max_length=40)
    enabled: bool = True


class ApprovalPolicy(BaseModel):
    require_for_side_effects: bool = True
    require_for_email_send: bool = True


# Chat + Schedule + tool (Pipedream event). Legacy "manual" maps to chat;
# bare "webhook" without a component is dropped.
TriggerKind = Literal["chat", "schedule", "manual", "webhook", "tool"]


class TriggerConfig(BaseModel):
    kind: TriggerKind = "chat"
    enabled: bool = True
    cron: str | None = Field(default=None, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)
    app_id: str | None = Field(default=None, max_length=128)
    component_id: str | None = Field(default=None, max_length=256)
    label: str | None = Field(default=None, max_length=160)
    extra_props: dict[str, Any] = Field(default_factory=dict)


class AgentSpec(BaseModel):
    """Versioned, declarative specification of a Stack32 agent (V2/V3/V4)."""

    schema_version: Literal["2.0", "3.0", "4.0", "5.0"] = "2.0"
    identity: AgentIdentity
    goal: str = Field(min_length=1, max_length=4000)
    instructions: AgentInstructions
    model_policy: ModelPolicy = Field(default_factory=ModelPolicy)
    # V5+ additive: exact generated-agent model (BYOK). None until the user selects one.
    model: ModelConfig | None = None
    input_config: InputConfig = Field(default_factory=InputConfig)
    tools: list[ToolBinding] = Field(default_factory=list, max_length=MAX_AGENT_TOOLS)
    knowledge: KnowledgeConfig = Field(default_factory=KnowledgeConfig)
    memory: MemoryConfig = Field(default_factory=MemoryConfig)
    rules: list[AgentRule] = Field(default_factory=list, max_length=50)
    output: OutputConfig = Field(default_factory=OutputConfig)
    starter_prompts: list[str] = Field(default_factory=list, max_length=12)
    graph: GraphSpec
    runtime: RuntimeLimits = Field(default_factory=RuntimeLimits)
    security: AgentSecurityPolicy = Field(default_factory=AgentSecurityPolicy)
    # V3+ additive
    connection_requirements: list[ConnectionRequirement] = Field(
        default_factory=list, max_length=MAX_AGENT_TOOLS
    )
    connection_bindings: list[ConnectionBindingRef] = Field(
        default_factory=list, max_length=MAX_AGENT_TOOLS
    )
    approvals: ApprovalPolicy = Field(default_factory=ApprovalPolicy)
    triggers: list[TriggerConfig] = Field(default_factory=list, max_length=20)

    @field_validator("tools")
    @classmethod
    def _unique_tools(cls, tools: list[ToolBinding]) -> list[ToolBinding]:
        ids = [t.tool_id for t in tools]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate tool bindings are not allowed.")
        return tools


def migrate_v2_to_v3(spec: AgentSpec | dict[str, Any]) -> AgentSpec:
    """Additive upgrade: keep graph/tools; set schema_version 3.0 + empty connection fields."""
    data = spec.model_dump() if isinstance(spec, AgentSpec) else dict(spec)
    data["schema_version"] = "3.0"
    data.setdefault("connection_requirements", [])
    data.setdefault("connection_bindings", [])
    data.setdefault("approvals", ApprovalPolicy().model_dump())
    data.setdefault("triggers", [])
    return AgentSpec.model_validate(data)


def migrate_v3_to_v4(spec: AgentSpec | dict[str, Any]) -> AgentSpec:
    """Upgrade tools to hybrid bindings (provider/app/external_action_id)."""
    data = spec.model_dump() if isinstance(spec, AgentSpec) else dict(spec)
    data["schema_version"] = "4.0"
    tools_out: list[dict[str, Any]] = []
    for item in data.get("tools") or []:
        if not isinstance(item, dict):
            continue
        tool_id = str(item.get("tool_id") or "")
        provider = str(item.get("provider") or "native")
        if tool_id == "http_request":
            provider = "custom_api"
        elif tool_id.startswith("pd:") or tool_id.startswith("pipedream:"):
            provider = "pipedream"
        tools_out.append(
            {
                "tool_id": tool_id,
                "provider": provider,
                "app_id": item.get("app_id"),
                "external_action_id": item.get("external_action_id") or item.get("provider_tool_id"),
                "version": item.get("version"),
                "enabled": bool(item.get("enabled", True)),
                "approval_mode": item.get("approval_mode") or "never",
                "config": item.get("config") or {},
                "connection_requirement_id": item.get("connection_requirement_id"),
            }
        )
    data["tools"] = tools_out

    reqs_out: list[dict[str, Any]] = []
    for idx, req in enumerate(data.get("connection_requirements") or []):
        if not isinstance(req, dict):
            continue
        tool_ids = list(req.get("tool_ids") or req.get("required_for") or [])
        reqs_out.append(
            {
                "id": req.get("id") or f"conn_req_{idx + 1}",
                "provider": str(req.get("provider") or "google"),
                "app_id": req.get("app_id") or req.get("provider"),
                "auth_type": req.get("auth_type") or "oauth2",
                "tool_ids": tool_ids,
                "required_for": list(req.get("required_for") or tool_ids),
                "required": bool(req.get("required", True)),
            }
        )
    data["connection_requirements"] = reqs_out
    return AgentSpec.model_validate(data)


def normalize_triggers(raw_triggers: Any) -> list[dict[str, Any]]:
    """Normalize triggers to Chat / Schedule / tool.

    manual -> chat. webhook without component_id is dropped; webhook with a
    component becomes tool. Unknown kinds are dropped. Always keep Chat.
    """
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw_triggers or []:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("kind") or "").strip().lower()
        if kind == "manual":
            kind = "chat"
        if kind == "webhook":
            kind = "tool" if item.get("component_id") else ""
        if kind not in ("chat", "schedule", "tool"):
            continue
        if kind in seen:
            continue
        seen.add(kind)
        extra = item.get("extra_props") if isinstance(item.get("extra_props"), dict) else {}
        row: dict[str, Any] = {
            "kind": kind,
            "enabled": bool(item.get("enabled", True)),
            "cron": item.get("cron") if kind == "schedule" else None,
            "timezone": item.get("timezone") if kind == "schedule" else None,
            "app_id": None,
            "component_id": None,
            "label": None,
            "extra_props": {},
        }
        if kind == "tool":
            row["app_id"] = str(item.get("app_id") or "").strip()[:128] or None
            row["component_id"] = str(item.get("component_id") or "").strip()[:256] or None
            row["label"] = str(item.get("label") or "").strip()[:160] or None
            row["extra_props"] = extra
        out.append(row)
    if not any(t["kind"] == "chat" for t in out):
        out.insert(
            0,
            {
                "kind": "chat",
                "enabled": True,
                "cron": None,
                "timezone": None,
                "app_id": None,
                "component_id": None,
                "label": None,
                "extra_props": {},
            },
        )
    if not out:
        out.append(
            {
                "kind": "chat",
                "enabled": True,
                "cron": None,
                "timezone": None,
                "app_id": None,
                "component_id": None,
                "label": None,
                "extra_props": {},
            }
        )
    return out


def migrate_v4_to_v5(spec: AgentSpec | dict[str, Any]) -> AgentSpec:
    """Additive V5 upgrade: normalize triggers to Chat/Schedule; carry ModelConfig.

    Never fabricates a concrete model for legacy agents — ``model`` stays ``None``
    so readiness reports ``needs_setup`` until the user picks a provider/model.
    """
    data = spec.model_dump() if isinstance(spec, AgentSpec) else dict(spec)
    data["schema_version"] = "5.0"
    data["triggers"] = normalize_triggers(data.get("triggers"))
    if data.get("model") is None:
        data["model"] = None
    return AgentSpec.model_validate(data)


def migrate_v1_to_v2(raw: dict[str, Any]) -> AgentSpec:
    """Best-effort loader from Phase 2 skeleton / V1 AgentSpec."""
    from agent_service.models.graph_spec import default_linear_graph

    version = raw.get("schema_version") or raw.get("schemaVersion")
    if version in ("2.0", "3.0", "4.0"):
        return AgentSpec.model_validate(_camel_to_snake_spec(raw))

    name = str(raw.get("name") or "Untitled agent")
    goal = str(raw.get("goal") or "Help the user achieve their goal.")
    instructions_raw = raw.get("instructions")
    if isinstance(instructions_raw, dict):
        system = str(instructions_raw.get("system") or instructions_raw.get("persona") or goal)
    else:
        system = str(instructions_raw or f"You are {name}. {goal}")

    tools_in = raw.get("tools") or []
    tools: list[ToolBinding] = []
    for item in tools_in:
        if isinstance(item, dict):
            tool_id = item.get("tool") or item.get("tool_id")
            if tool_id in NATIVE_BUILTIN_TOOL_IDS:
                tools.append(
                    ToolBinding(
                        tool_id=str(tool_id),
                        enabled=bool(item.get("enabled", True)),
                    )
                )

    profile = "balanced"
    mp = raw.get("model_profile") or raw.get("modelProfile") or {}
    if isinstance(mp, dict):
        p = mp.get("profile")
        if p == "fast":
            profile = "fast"
        elif p in ("heavy", "reasoning"):
            profile = "reasoning"
        elif p in ("standard", "balanced"):
            profile = "balanced"
    elif isinstance(mp, str):
        if mp in ("fast", "balanced", "reasoning"):
            profile = mp
        elif mp == "heavy":
            profile = "reasoning"

    memory_raw = raw.get("memory") or {}
    knowledge_raw = raw.get("knowledge") or {}
    runtime_raw = raw.get("runtime") or {}
    rules_raw = raw.get("rules") or []
    rules: list[AgentRule] = []
    for idx, rule in enumerate(rules_raw):
        if isinstance(rule, str) and rule.strip():
            rules.append(AgentRule(id=f"rule_{idx + 1}", text=rule.strip()))
        elif isinstance(rule, dict) and rule.get("text"):
            rules.append(
                AgentRule(
                    id=str(rule.get("id") or f"rule_{idx + 1}"),
                    text=str(rule["text"]),
                )
            )

    graph_raw = raw.get("graph") or raw.get("graph_spec")
    graph = GraphSpec.model_validate(graph_raw) if graph_raw else default_linear_graph(tools)

    return AgentSpec(
        identity=AgentIdentity(
            name=name,
            role=str(raw.get("role") or goal[:240] or "Assistant"),
            description=str(raw.get("description") or ""),
            tone=str(raw.get("tone") or "professional"),
        ),
        goal=goal,
        instructions=AgentInstructions(system=system),
        model_policy=ModelPolicy(profile=profile),  # type: ignore[arg-type]
        tools=tools,
        knowledge=KnowledgeConfig(
            enabled=bool(knowledge_raw.get("enabled", False)),
            source_ids=[
                str(x)
                for x in knowledge_raw.get("source_ids") or knowledge_raw.get("sourceIds") or []
            ],
        ),
        memory=MemoryConfig(
            conversation_window=int(
                memory_raw.get("conversation_window")
                or memory_raw.get("conversationWindow")
                or 12
            ),
            semantic_enabled=bool(memory_raw.get("semantic_enabled", False)),
            write_policy=memory_raw.get("write_policy") or "explicit",  # type: ignore[arg-type]
        ),
        rules=rules,
        output=OutputConfig(
            format=(raw.get("output") or {}).get("format", "markdown")
            if isinstance(raw.get("output"), dict)
            else "markdown"
        ),
        starter_prompts=[
            str(x) for x in raw.get("starter_prompts") or raw.get("starterPrompts") or []
        ],
        graph=graph,
        runtime=RuntimeLimits(
            max_steps=int(runtime_raw.get("max_steps") or runtime_raw.get("maxSteps") or 8),
            timeout_seconds=int(
                runtime_raw.get("timeout_seconds") or runtime_raw.get("timeoutSeconds") or 60
            ),
            max_tool_calls=int(
                runtime_raw.get("max_tool_calls") or runtime_raw.get("maxToolCalls") or 6
            ),
        ),
    )


def load_agent_spec(raw: AgentSpec | dict[str, Any]) -> AgentSpec:
    """Load any supported AgentSpec version and migrate through to the newest shape."""
    if isinstance(raw, AgentSpec):
        data = raw.model_dump()
    else:
        data = _camel_to_snake_spec(dict(raw))

    version = str(data.get("schema_version") or "1.0")
    if version in {"1.0", "1"}:
        spec = migrate_v1_to_v2(data)
        data = spec.model_dump()
        version = spec.schema_version

    if version == "2.0":
        spec = migrate_v2_to_v3(data)
        data = spec.model_dump()
        version = "3.0"

    if version == "3.0":
        spec = migrate_v3_to_v4(data)
        data = spec.model_dump()
        version = "4.0"

    if version == "4.0":
        return migrate_v4_to_v5(data)

    if version == "5.0":
        return AgentSpec.model_validate(data)

    # Unknown → best-effort V1 path then full chain.
    return migrate_v4_to_v5(migrate_v3_to_v4(migrate_v2_to_v3(migrate_v1_to_v2(data))))


def _camel_to_snake_spec(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize common camelCase keys used by the web mappers."""
    if "schemaVersion" in raw and "schema_version" not in raw:
        data = dict(raw)
        data["schema_version"] = data.pop("schemaVersion")
        mapping = {
            "modelPolicy": "model_policy",
            "inputConfig": "input_config",
            "starterPrompts": "starter_prompts",
        }
        for camel, snake in mapping.items():
            if camel in data and snake not in data:
                data[snake] = data.pop(camel)
        return data
    return raw


class AgentSpecPatch(BaseModel):
    base_version_id: UUID
    operations: list[dict[str, Any]] = Field(min_length=1, max_length=50)
    reason: str = Field(min_length=1, max_length=500)


ALLOWED_PATCH_OPS = frozenset(
    {
        "replace_identity",
        "replace_goal",
        "replace_instructions",
        "add_tool",
        "remove_tool",
        "update_tool",
        "update_memory",
        "update_knowledge",
        "add_rule",
        "remove_rule",
        "update_output",
        "replace_graph",
        "update_graph_node",
        "add_graph_node",
        "remove_graph_node",
        "add_graph_edge",
        "remove_graph_edge",
    }
)
