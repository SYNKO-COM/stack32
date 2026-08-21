import type {
  Agent,
  AgentIdentity,
  AgentSpec,
  AgentStatus,
  AgentTrigger,
  AgentVersion,
  ApprovalMode,
  BuildBoardNode,
  BuilderAction,
  BuilderMessage,
  BuilderSuggestion,
  BuilderUiComponent,
  GraphEdge,
  GraphNode,
  GraphSpec,
  KnowledgeSource,
  LiveMessage,
  MessageAttachment,
  Profile,
  Subscription,
  SubscriptionStatus,
  TestStatus,
  ToolBinding,
  ToolConfig,
  ToolId,
  TriggerKind,
  User,
} from "@/lib/domain/types";
import { pricePlanSelection } from "@/lib/billing/plans";
import type { Database, Json } from "@/lib/supabase/database.types";

function parseMessageAttachments(raw: unknown): MessageAttachment[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const items: MessageAttachment[] = [];
  for (const entry of raw) {
    const rec = asRecord(entry);
    const id = typeof rec.id === "string" ? rec.id : "";
    const name = typeof rec.name === "string" ? rec.name : "";
    const mimeType =
      typeof rec.mimeType === "string"
        ? rec.mimeType
        : typeof rec.mime_type === "string"
          ? rec.mime_type
          : "application/octet-stream";
    if (!id || !name) continue;
    const kind = rec.kind === "file" ? "file" : "image";
    items.push({
      id,
      name,
      mimeType,
      kind,
      url: typeof rec.url === "string" ? rec.url : undefined,
      bucket: typeof rec.bucket === "string" ? rec.bucket : undefined,
      path: typeof rec.path === "string" ? rec.path : undefined,
      sizeBytes:
        typeof rec.sizeBytes === "number"
          ? rec.sizeBytes
          : typeof rec.size_bytes === "number"
            ? rec.size_bytes
            : undefined,
    });
  }
  return items.length > 0 ? items : undefined;
}

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type OnboardingRow = Database["public"]["Tables"]["onboarding_responses"]["Row"];
type AgentRow = Database["public"]["Tables"]["agents"]["Row"];
type AgentVersionRow = Database["public"]["Tables"]["agent_versions"]["Row"];
type BuilderMessageRow = Database["public"]["Tables"]["builder_messages"]["Row"];
type LiveMessageRow = Database["public"]["Tables"]["live_messages"]["Row"];
type KnowledgeSourceRow = Database["public"]["Tables"]["knowledge_sources"]["Row"];
type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];

/* ----------------------------------------------------------------------- */
/* Auth / profile                                                           */
/* ----------------------------------------------------------------------- */

export function mapSupabaseUser(u: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): User {
  const meta = u.user_metadata ?? {};
  return {
    id: u.id,
    email: u.email ?? "",
    name:
      (typeof meta.full_name === "string" && meta.full_name) ||
      (typeof meta.name === "string" && meta.name) ||
      undefined,
    avatarUrl: typeof meta.avatar_url === "string" ? meta.avatar_url : undefined,
  };
}

export function mapProfile(
  row: Pick<
    ProfileRow,
    | "id"
    | "first_name"
    | "phone"
    | "username"
    | "locale"
    | "onboarding_completed"
  >,
  onboarding?: OnboardingRow | null,
): Profile {
  return {
    userId: row.id,
    firstName: row.first_name ?? undefined,
    phone: row.phone ?? undefined,
    username: row.username ?? undefined,
    locale: row.locale,
    onboardingCompleted: row.onboarding_completed,
    discoverySource: onboarding?.discovery_source ?? undefined,
    role: onboarding?.role ?? undefined,
    primaryUseCase: onboarding?.primary_goal ?? undefined,
  };
}

/* ----------------------------------------------------------------------- */
/* AgentSpec: DB skeleton (snake_case) <-> domain (camelCase)               */
/* ----------------------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asApprovalMode(value: unknown): ApprovalMode | undefined {
  if (value === "never" || value === "always" || value === "conditional") return value;
  return undefined;
}

/** Loosely map V4 tool bindings (snake_case or camelCase). */
function mapToolBindings(rawTools: unknown): { tools: ToolConfig[]; toolBindings: ToolBinding[] } {
  if (!Array.isArray(rawTools)) return { tools: [], toolBindings: [] };
  const toolBindings: ToolBinding[] = [];
  const tools: ToolConfig[] = [];
  for (const item of rawTools) {
    if (typeof item === "string") {
      const toolId = item.trim();
      if (!toolId) continue;
      tools.push({ tool: toolId as ToolId, enabled: true });
      toolBindings.push({ toolId, enabled: true, provider: "native" });
      continue;
    }
    const rec = asRecord(item);
    const toolIdRaw = rec.tool_id ?? rec.toolId ?? rec.tool ?? rec.id;
    const toolId = typeof toolIdRaw === "string" ? toolIdRaw.trim() : "";
    if (!toolId) continue;
    const enabled = rec.enabled !== false;
    const binding: ToolBinding = {
      toolId,
      enabled,
      provider: typeof rec.provider === "string" ? rec.provider : undefined,
      appId:
        typeof rec.app_id === "string"
          ? rec.app_id
          : typeof rec.appId === "string"
            ? rec.appId
            : undefined,
      externalActionId:
        typeof rec.external_action_id === "string"
          ? rec.external_action_id
          : typeof rec.externalActionId === "string"
            ? rec.externalActionId
            : undefined,
      version: typeof rec.version === "string" ? rec.version : undefined,
      approvalMode: asApprovalMode(rec.approval_mode ?? rec.approvalMode),
      config: asRecord(rec.config),
      connectionRequirementId:
        typeof rec.connection_requirement_id === "string"
          ? rec.connection_requirement_id
          : typeof rec.connectionRequirementId === "string"
            ? rec.connectionRequirementId
            : undefined,
    };
    toolBindings.push(binding);
    tools.push({ tool: toolId as ToolId, enabled });
  }
  return { tools, toolBindings };
}

function mapIdentity(raw: unknown): AgentIdentity | undefined {
  const rec = asRecord(raw);
  const name = typeof rec.name === "string" ? rec.name : "";
  if (!name) return undefined;
  return {
    name,
    role: typeof rec.role === "string" ? rec.role : "",
    description: typeof rec.description === "string" ? rec.description : undefined,
    tone: typeof rec.tone === "string" ? rec.tone : undefined,
  };
}

function mapGraphNode(raw: unknown): GraphNode | null {
  const rec = asRecord(raw);
  const id = typeof rec.id === "string" ? rec.id : "";
  const type = typeof rec.type === "string" ? rec.type : "";
  const name = typeof rec.name === "string" ? rec.name : "";
  if (!id || !type || !name) return null;
  return {
    id,
    type: type as GraphNode["type"],
    name,
    description: typeof rec.description === "string" ? rec.description : undefined,
    config: asRecord(rec.config),
  };
}

function mapGraphSpec(raw: unknown): GraphSpec | undefined {
  const rec = asRecord(raw);
  const entryNodeId =
    typeof rec.entry_node_id === "string"
      ? rec.entry_node_id
      : typeof rec.entryNodeId === "string"
        ? rec.entryNodeId
        : "";
  const nodesRaw = Array.isArray(rec.nodes) ? rec.nodes : [];
  const edgesRaw = Array.isArray(rec.edges) ? rec.edges : [];
  const nodes = nodesRaw.map(mapGraphNode).filter((n): n is GraphNode => n !== null);
  if (!entryNodeId || nodes.length === 0) return undefined;
  const edges = edgesRaw
    .map((e): GraphEdge | null => {
      const edge = asRecord(e);
      const id = typeof edge.id === "string" ? edge.id : "";
      const source = typeof edge.source === "string" ? edge.source : "";
      const target = typeof edge.target === "string" ? edge.target : "";
      if (!id || !source || !target) return null;
      const mapped: GraphEdge = { id, source, target };
      if (typeof edge.label === "string") mapped.label = edge.label;
      return mapped;
    })
    .filter((e): e is GraphEdge => e !== null);
  return {
    version: typeof rec.version === "string" ? rec.version : "1.0",
    entryNodeId,
    nodes,
    edges,
  };
}

/** Public alias for API identity payloads. */
export function mapIdentityFromApi(raw: unknown): AgentIdentity | undefined {
  return mapIdentity(raw);
}

/** Public alias for API / action graph payloads. */
export function mapGraphSpecFromApi(raw: unknown): GraphSpec | null {
  return mapGraphSpec(raw) ?? null;
}

function mapUiComponent(raw: unknown): BuilderUiComponent | undefined {
  const rec = asRecord(raw);
  const type = rec.type;
  if (
    type !== "agent_identity_form" &&
    type !== "secret_form" &&
    type !== "agent_capabilities_form" &&
    type !== "dynamic_questions_form" &&
    type !== "provider_clarification_form" &&
    type !== "tool_review_form" &&
    type !== "connection_form" &&
    type !== "approval_form"
  ) {
    return undefined;
  }
  const requestId =
    typeof rec.request_id === "string"
      ? rec.request_id
      : typeof rec.requestId === "string"
        ? rec.requestId
        : "";
  if (!requestId) return undefined;
  const contextRaw = rec.context;
  const context =
    contextRaw === "live" || contextRaw === "builder" ? contextRaw : undefined;
  let fields = Array.isArray(rec.fields)
    ? rec.fields
        .map((f) => {
          const field = asRecord(f);
          const key = typeof field.key === "string" ? field.key : "";
          if (!key) return null;
          const options = Array.isArray(field.options)
            ? field.options.filter((o): o is string => typeof o === "string")
            : undefined;
          return {
            key,
            type: typeof field.type === "string" ? field.type : "text",
            required: field.required === true,
            suggested_value:
              typeof field.suggested_value === "string"
                ? field.suggested_value
                : typeof field.suggestedValue === "string"
                  ? field.suggestedValue
                  : undefined,
            options,
            label: typeof field.label === "string" ? field.label : undefined,
          };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null)
    : [];

  // connection_form often carries providers/tool_ids/requirements instead of fields.
  let connectionRequirements:
    | Array<{ provider: string; appId?: string; toolIds?: string[] }>
    | undefined;
  if (type === "connection_form") {
    const providers = Array.isArray(rec.providers)
      ? rec.providers.filter((p): p is string => typeof p === "string")
      : [];
    const toolIds = Array.isArray(rec.tool_ids)
      ? rec.tool_ids.filter((t): t is string => typeof t === "string")
      : Array.isArray(rec.toolIds)
        ? rec.toolIds.filter((t): t is string => typeof t === "string")
        : [];
    const requirements = Array.isArray(rec.requirements) ? rec.requirements : [];
    connectionRequirements = [];
    if (requirements.length > 0) {
      for (const raw of requirements) {
        const req = asRecord(raw);
        const provider =
          (typeof req.provider === "string" ? req.provider : "") || "pipedream";
        const appId =
          (typeof req.app_id === "string" ? req.app_id : undefined) ||
          (typeof req.appId === "string" ? req.appId : undefined);
        const reqTools = Array.isArray(req.tool_ids)
          ? req.tool_ids.filter((t): t is string => typeof t === "string")
          : Array.isArray(req.toolIds)
            ? req.toolIds.filter((t): t is string => typeof t === "string")
            : [];
        connectionRequirements.push({
          provider,
          appId,
          toolIds: reqTools.length > 0 ? reqTools : toolIds,
        });
      }
    } else if (providers.length > 0) {
      for (const provider of providers) {
        connectionRequirements.push({
          provider,
          toolIds,
        });
      }
    }
    if (fields.length === 0 && connectionRequirements.length > 0) {
      const first = connectionRequirements[0];
      fields = [
        {
          key: "provider",
          type: "text",
          required: true,
          suggested_value: first.provider,
          options: undefined,
          label: undefined,
        },
        ...(first.appId
          ? [
              {
                key: "app_id",
                type: "text",
                required: false,
                suggested_value: first.appId,
                options: undefined,
                label: undefined,
              },
            ]
          : []),
        ...(first.toolIds ?? []).map((tid) => ({
          key: "tool_id",
          type: "text",
          required: false,
          suggested_value: tid,
          options: undefined,
          label: undefined,
        })),
      ];
    }
  }

  let tools:
    | Array<{
        toolId: string;
        name: string;
        provider: string;
        appId?: string;
        externalActionId?: string;
        utility: string;
        change: "add" | "keep" | "remove";
        removable?: boolean;
        toolIds?: string[];
      }>
    | undefined;
  let mode: "initial" | "modify" | undefined;
  if (type === "tool_review_form") {
    const modeRaw = rec.mode;
    mode = modeRaw === "modify" ? "modify" : "initial";
    tools = Array.isArray(rec.tools)
      ? rec.tools
          .map((raw) => {
            const row = asRecord(raw);
            const toolId =
              (typeof row.tool_id === "string" ? row.tool_id : "") ||
              (typeof row.toolId === "string" ? row.toolId : "");
            if (!toolId) return null;
            const changeRaw = typeof row.change === "string" ? row.change : "add";
            const change: "add" | "keep" | "remove" =
              changeRaw === "keep" || changeRaw === "remove" ? changeRaw : "add";
            const mapped: {
              toolId: string;
              name: string;
              provider: string;
              appId?: string;
              externalActionId?: string;
              utility: string;
              change: "add" | "keep" | "remove";
              removable?: boolean;
              toolIds?: string[];
            } = {
              toolId,
              name:
                typeof row.name === "string" && row.name.trim()
                  ? row.name
                  : toolId.replace(/_/g, " "),
              provider:
                typeof row.provider === "string" && row.provider
                  ? row.provider
                  : "native",
              appId:
                typeof row.app_id === "string"
                  ? row.app_id
                  : typeof row.appId === "string"
                    ? row.appId
                    : undefined,
              externalActionId:
                typeof row.external_action_id === "string"
                  ? row.external_action_id
                  : typeof row.externalActionId === "string"
                    ? row.externalActionId
                    : undefined,
              utility: typeof row.utility === "string" ? row.utility : "",
              change,
              removable: row.removable !== false,
            };
            const toolIdsRaw = Array.isArray(row.tool_ids)
              ? row.tool_ids
              : Array.isArray(row.toolIds)
                ? row.toolIds
                : [];
            const toolIds = toolIdsRaw.filter((id): id is string => typeof id === "string" && Boolean(id));
            if (toolIds.length > 0) mapped.toolIds = toolIds;
            return mapped;
          })
          .filter((t): t is NonNullable<typeof t> => t !== null)
      : [];
  }

  return {
    type,
    version: "1",
    requestId,
    context,
    fields,
    ...(mode ? { mode } : {}),
    ...(tools ? { tools } : {}),
    ...(connectionRequirements && connectionRequirements.length > 0
      ? { connectionRequirements }
      : {}),
  };
}

/**
 * Convert a stored jsonb spec into the domain AgentSpec the UI renders.
 * Handles Phase 2 DB skeleton (snake_case), domain camelCase, and V2 specs
 * with identity/graph blocks.
 */
export function specFromDb(json: Json, fallbackName = "Untitled agent"): AgentSpec {
  const raw = asRecord(json);

  // V2+ specs stored in snake_case (agent-service output). V3/V4 keep the same shape.
  const schemaVersionRaw =
    typeof raw.schema_version === "string"
      ? raw.schema_version
      : typeof raw.schemaVersion === "string"
        ? raw.schemaVersion
        : "";
  if (
    schemaVersionRaw === "2.0" ||
    schemaVersionRaw === "3.0" ||
    schemaVersionRaw === "4.0" ||
    schemaVersionRaw === "5.0"
  ) {
    const instructions = asRecord(raw.instructions);
    const modelPolicy = asRecord(raw.model_policy ?? raw.modelPolicy);
    const profileRaw = typeof modelPolicy.profile === "string" ? modelPolicy.profile : "balanced";
    const profile =
      profileRaw === "fast" ? "fast" : profileRaw === "reasoning" || profileRaw === "heavy" ? "heavy" : "standard";
    // Schema 5.0 exact BYOK model (provider/model_id) + Chat/Schedule triggers.
    const modelRaw = asRecord(raw.model);
    const modelProvider =
      typeof modelRaw.provider === "string" ? modelRaw.provider : undefined;
    const modelId =
      typeof modelRaw.model_id === "string"
        ? modelRaw.model_id
        : typeof modelRaw.modelId === "string"
          ? modelRaw.modelId
          : undefined;
    const exactModel =
      modelProvider && modelId ? { provider: modelProvider, modelId } : null;
    const triggers: AgentTrigger[] = (Array.isArray(raw.triggers) ? raw.triggers : []).map(
      (t) => {
        const rec = asRecord(t);
        const kind: TriggerKind =
          rec.kind === "schedule"
            ? "schedule"
            : rec.kind === "manual"
              ? "manual"
              : rec.kind === "tool" || (rec.kind === "webhook" && rec.component_id)
                ? "tool"
                : rec.kind === "webhook"
                  ? "webhook"
                  : "chat";
        return {
          kind,
          enabled: rec.enabled !== false,
          cron: typeof rec.cron === "string" ? rec.cron : null,
          timezone: typeof rec.timezone === "string" ? rec.timezone : null,
          appId:
            typeof rec.app_id === "string"
              ? rec.app_id
              : typeof rec.appId === "string"
                ? rec.appId
                : null,
          componentId:
            typeof rec.component_id === "string"
              ? rec.component_id
              : typeof rec.componentId === "string"
                ? rec.componentId
                : null,
          label: typeof rec.label === "string" ? rec.label : null,
          extraProps:
            rec.extra_props && typeof rec.extra_props === "object" && !Array.isArray(rec.extra_props)
              ? (rec.extra_props as Record<string, unknown>)
              : rec.extraProps && typeof rec.extraProps === "object" && !Array.isArray(rec.extraProps)
                ? (rec.extraProps as Record<string, unknown>)
                : {},
        };
      },
    );
    const identity = mapIdentity(raw.identity);
    const name = identity?.name ?? fallbackName;
    const { tools, toolBindings } = mapToolBindings(raw.tools);
    const knowledge = asRecord(raw.knowledge);
    const memory = asRecord(raw.memory);
    const output = asRecord(raw.output);
    const runtime = asRecord(raw.runtime);
    const rulesRaw = Array.isArray(raw.rules) ? raw.rules : [];
    const rules = rulesRaw
      .map((r) => (typeof r === "string" ? r : asRecord(r).text))
      .filter((r): r is string => typeof r === "string" && r.length > 0);
    const graph = mapGraphSpec(raw.graph ?? raw.graph_spec);

    return {
      schemaVersion: schemaVersionRaw,
      name,
      slug:
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "agent",
      goal: typeof raw.goal === "string" ? raw.goal : "",
      instructions:
        typeof instructions.system === "string"
          ? instructions.system
          : typeof raw.instructions === "string"
            ? raw.instructions
            : "",
      modelProfile: { profile, temperature: 0.4 },
      tools,
      toolBindings: toolBindings.length > 0 ? toolBindings : undefined,
      knowledge: {
        enabled: knowledge.enabled === true || knowledge.retrieval_enabled === true,
        sourceIds: (() => {
          const rawIds = knowledge.source_ids ?? knowledge.sourceIds;
          return Array.isArray(rawIds)
            ? rawIds.filter((s: unknown): s is string => typeof s === "string")
            : [];
        })(),
      },
      memory: {
        conversationWindow:
          typeof memory.conversation_window === "number"
            ? memory.conversation_window
            : typeof memory.conversationWindow === "number"
              ? memory.conversationWindow
              : 12,
        conversationEnabled: memory.conversation_enabled !== false,
        semanticEnabled: memory.semantic_enabled === true,
        writePolicy:
          memory.write_policy === "never" ||
          memory.write_policy === "explicit" ||
          memory.write_policy === "automatic"
            ? memory.write_policy
            : undefined,
        retentionDays:
          typeof memory.retention_days === "number" ? memory.retention_days : undefined,
        provider:
          memory.provider === "external_postgres" || memory.provider === "stack32"
            ? memory.provider
            : "stack32",
        externalAppId:
          typeof memory.external_app_id === "string"
            ? memory.external_app_id
            : typeof memory.externalAppId === "string"
              ? memory.externalAppId
              : undefined,
        externalInstructions:
          typeof memory.external_instructions === "string"
            ? memory.external_instructions
            : typeof memory.externalInstructions === "string"
              ? memory.externalInstructions
              : undefined,
      },
      rules,
      output: {
        format:
          output.format === "table" || output.format === "text"
            ? output.format
            : "markdown",
        allowTables: output.allow_tables !== false && output.allowTables !== false,
      },
      starterPrompts: (() => {
        const prompts = raw.starter_prompts ?? raw.starterPrompts;
        return Array.isArray(prompts)
          ? prompts.filter((s: unknown): s is string => typeof s === "string")
          : [];
      })(),
      runtime: {
        maxSteps: typeof runtime.max_steps === "number" ? runtime.max_steps : 8,
        timeoutSeconds:
          typeof runtime.timeout_seconds === "number" ? runtime.timeout_seconds : 60,
        maxToolCalls:
          typeof runtime.max_tool_calls === "number" ? runtime.max_tool_calls : 6,
      },
      identity,
      graph,
      model: exactModel,
      triggers: triggers.length > 0 ? triggers : undefined,
    };
  }

  // Already in domain shape (mock builder output).
  if ("schemaVersion" in raw && "modelProfile" in raw) {
    const domain = raw as unknown as AgentSpec;
    if (!domain.graph && (raw.graph || raw.graph_spec)) {
      domain.graph = mapGraphSpec(raw.graph ?? raw.graph_spec);
    }
    if (!domain.identity && raw.identity) {
      domain.identity = mapIdentity(raw.identity);
    }
    return domain;
  }

  const instructions = asRecord(raw.instructions);
  const knowledge = asRecord(raw.knowledge);
  const memory = asRecord(raw.memory);
  const output = asRecord(raw.output);
  const runtime = asRecord(raw.runtime);
  const name = typeof raw.name === "string" && raw.name ? raw.name : fallbackName;

  const modelProfileRaw = typeof raw.model_profile === "string" ? raw.model_profile : "balanced";
  const profile =
    modelProfileRaw === "fast" ? "fast" : modelProfileRaw === "heavy" ? "heavy" : "standard";

  const { tools, toolBindings } = mapToolBindings(raw.tools);

  return {
    schemaVersion: typeof raw.schema_version === "string" ? raw.schema_version : "1.0",
    name,
    slug:
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "agent",
    goal: typeof raw.goal === "string" ? raw.goal : "",
    instructions: typeof instructions.system === "string" ? instructions.system : "",
    modelProfile: { profile, temperature: 0.4 },
    tools,
    toolBindings: toolBindings.length > 0 ? toolBindings : undefined,
    knowledge: {
      enabled: knowledge.retrieval_enabled === true,
      sourceIds: Array.isArray(knowledge.source_ids)
        ? knowledge.source_ids.filter((s): s is string => typeof s === "string")
        : [],
    },
    memory: {
      conversationWindow: typeof memory.conversation_window === "number" ? memory.conversation_window : 12,
    },
    rules: Array.isArray(raw.rules)
      ? raw.rules.filter((r): r is string => typeof r === "string")
      : [],
    output: {
      format:
        output.format === "table" || output.format === "text"
          ? output.format
          : "markdown",
      allowTables: output.allow_tables !== false,
    },
    starterPrompts: Array.isArray(raw.starter_prompts)
      ? raw.starter_prompts.filter((s): s is string => typeof s === "string")
      : [],
    runtime: {
      maxSteps: typeof runtime.max_steps === "number" ? runtime.max_steps : 8,
      timeoutSeconds: typeof runtime.timeout_seconds === "number" ? runtime.timeout_seconds : 60,
      maxToolCalls: typeof runtime.max_tool_calls === "number" ? runtime.max_tool_calls : 6,
    },
    graph: mapGraphSpec(raw.graph ?? raw.graph_spec),
  };
}

/** Serialize a domain AgentSpec into the DB skeleton shape. */
export function specToDb(spec: AgentSpec): Json {
  return {
    schema_version: spec.schemaVersion,
    name: spec.name,
    goal: spec.goal,
    instructions: {
      system: spec.instructions,
      tone: "professional",
      language: "auto",
    },
    model_profile:
      spec.modelProfile.profile === "fast"
        ? "fast"
        : spec.modelProfile.profile === "heavy"
          ? "heavy"
          : "balanced",
    input: { channels: ["chat"], attachments: [] },
    tools: spec.tools.map((t) => ({ tool: t.tool, enabled: t.enabled })),
    knowledge: {
      source_ids: spec.knowledge.sourceIds,
      retrieval_enabled: spec.knowledge.enabled,
    },
    memory: {
      conversation: true,
      semantic: false,
      conversation_window: spec.memory.conversationWindow,
    },
    rules: spec.rules,
    output: {
      format: spec.output.format,
      allow_tables: spec.output.allowTables,
      schema: null,
    },
    starter_prompts: spec.starterPrompts,
    runtime: {
      max_steps: spec.runtime.maxSteps,
      timeout_seconds: spec.runtime.timeoutSeconds,
      max_tool_calls: spec.runtime.maxToolCalls,
    },
  } as Json;
}

/* ----------------------------------------------------------------------- */
/* Agents / versions                                                        */
/* ----------------------------------------------------------------------- */

const AGENT_STATUSES: ReadonlySet<AgentStatus> = new Set([
  "draft",
  "building",
  "built",
  "ready",
  "needs_attention",
  "published",
  "waiting_for_input",
  "needs_setup",
  "archived",
]);

function mapAgentStatus(raw: string): AgentStatus {
  if (AGENT_STATUSES.has(raw as AgentStatus)) return raw as AgentStatus;
  return "draft";
}

export function mapAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    slug: row.slug,
    icon: row.icon_key ?? "sparkles",
    status: mapAgentStatus(row.status),
    draftVersionId: row.draft_version_id ?? undefined,
    publishedVersionId: row.published_version_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTestStatus(dbStatus: string): TestStatus {
  if (dbStatus === "passed" || dbStatus === "passed_with_warnings") return "passed";
  if (dbStatus === "failed") return "failed";
  return "pending";
}

export function mapAgentVersion(row: AgentVersionRow, agentName?: string): AgentVersion {
  return {
    id: row.id,
    agentId: row.agent_id,
    versionNumber: row.version_number,
    spec: specFromDb(row.spec, agentName),
    testStatus: mapTestStatus(row.test_status),
    createdAt: row.created_at,
  };
}

/* ----------------------------------------------------------------------- */
/* Messages                                                                 */
/* ----------------------------------------------------------------------- */

export function mapBuilderMessage(row: BuilderMessageRow): BuilderMessage | null {
  if (row.role !== "user" && row.role !== "assistant") return null;
  const meta = asRecord(row.metadata);
  const uiRaw = meta.ui_component ?? meta.uiComponent;
  const formResolved = meta.form_resolved === true || meta.formResolved === true;
  const identityRaw = asRecord(meta.identity_summary ?? meta.identitySummary);
  const boardRaw = asRecord(meta.build_board ?? meta.buildBoard);
  const cardRaw = meta.card;
  const card =
    cardRaw === "identity_confirmed" ||
    cardRaw === "build_progress" ||
    cardRaw === "ready" ||
    cardRaw === "thinking"
      ? cardRaw
      : undefined;

  const suggestions: BuilderSuggestion[] | undefined = Array.isArray(meta.suggestions)
    ? meta.suggestions
        .map((s): BuilderSuggestion | null => {
          const rec = asRecord(s);
          const id = typeof rec.id === "string" ? rec.id : "";
          const labelKey =
            typeof rec.labelKey === "string"
              ? rec.labelKey
              : typeof rec.label_key === "string"
                ? rec.label_key
                : "";
          if (!id || !labelKey) return null;
          const actionRaw = rec.action;
          const action: BuilderAction | undefined =
            actionRaw === "test_agent" ||
            actionRaw === "open_ai_agent" ||
            actionRaw === "view_structure" ||
            actionRaw === "fix_automatically" ||
            actionRaw === "view_changes"
              ? actionRaw
              : undefined;
          return {
            id,
            labelKey,
            prompt: typeof rec.prompt === "string" ? rec.prompt : undefined,
            action,
          };
        })
        .filter((s): s is BuilderSuggestion => s !== null)
    : undefined;

  const nodes: BuildBoardNode[] = Array.isArray(boardRaw.nodes)
    ? boardRaw.nodes
        .map((n): BuildBoardNode | null => {
          const rec = asRecord(n);
          const id = typeof rec.id === "string" ? rec.id : "";
          const labelKey =
            typeof rec.labelKey === "string"
              ? rec.labelKey
              : typeof rec.label_key === "string"
                ? rec.label_key
                : "";
          const state = rec.state;
          if (!id || !labelKey) return null;
          if (
            state !== "pending" &&
            state !== "running" &&
            state !== "done" &&
            state !== "failed"
          ) {
            return null;
          }
          return { id, labelKey, state };
        })
        .filter((n): n is BuildBoardNode => n !== null)
    : [];
  const edges = Array.isArray(boardRaw.edges)
    ? boardRaw.edges
        .map((e) => {
          const rec = asRecord(e);
          const from = typeof rec.from === "string" ? rec.from : "";
          const to = typeof rec.to === "string" ? rec.to : "";
          if (!from || !to) return null;
          return { from, to };
        })
        .filter((e): e is NonNullable<typeof e> => e !== null)
    : [];

  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    steps: Array.isArray(meta.steps) ? (meta.steps as BuilderMessage["steps"]) : undefined,
    actions: Array.isArray(meta.actions)
      ? (meta.actions as BuilderMessage["actions"])
      : undefined,
    tone: typeof meta.tone === "string" ? (meta.tone as BuilderMessage["tone"]) : undefined,
    uiComponent: formResolved ? undefined : uiRaw ? mapUiComponent(uiRaw) : undefined,
    interruptRunId:
      typeof meta.interrupt_run_id === "string"
        ? meta.interrupt_run_id
        : typeof meta.interruptRunId === "string"
          ? meta.interruptRunId
          : typeof meta.run_id === "string"
            ? meta.run_id
            : typeof meta.runId === "string"
              ? meta.runId
              : undefined,
    playReadySound:
      meta.playReadySound === true || meta.play_ready_sound === true,
    formResolved,
    card,
    identitySummary:
      typeof identityRaw.name === "string"
        ? {
            name: identityRaw.name,
            role: typeof identityRaw.role === "string" ? identityRaw.role : "",
            tone: typeof identityRaw.tone === "string" ? identityRaw.tone : undefined,
            description:
              typeof identityRaw.description === "string" ? identityRaw.description : undefined,
          }
        : undefined,
    buildBoard: nodes.length > 0 ? { nodes, edges } : undefined,
    focus: typeof meta.focus === "string" ? meta.focus : undefined,
    suggestions,
    projectFiles: Array.isArray(meta.project_files)
      ? (meta.project_files as unknown[]).filter((p): p is string => typeof p === "string")
      : Array.isArray(meta.projectFiles)
        ? (meta.projectFiles as unknown[]).filter((p): p is string => typeof p === "string")
        : undefined,
    detectedProblems: (() => {
      const raw = meta.detected_problems ?? meta.detectedProblems;
      if (!Array.isArray(raw)) return undefined;
      const items = raw
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
        .slice(0, 6);
      return items.length > 0 ? items : undefined;
    })(),
    attachments: parseMessageAttachments(meta.attachments),
    interactionMode:
      meta.mode === "chat" || meta.mode === "build"
        ? meta.mode
        : undefined,
    createdAt: row.created_at,
  };
}

export function mapLiveMessage(row: LiveMessageRow): LiveMessage | null {
  if (row.role !== "user" && row.role !== "assistant") return null;
  const meta = asRecord(row.metadata);
  const uiRaw = meta.ui_component ?? meta.uiComponent;
  const uiComponent = uiRaw ? mapUiComponent(uiRaw) : undefined;
  const runId =
    (typeof row.run_id === "string" && row.run_id) ||
    (typeof meta.run_id === "string" ? meta.run_id : undefined) ||
    (typeof meta.runId === "string" ? meta.runId : undefined) ||
    undefined;
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    citations: Array.isArray(row.citations)
      ? (row.citations as unknown as LiveMessage["citations"])
      : undefined,
    artifacts: Array.isArray(row.artifacts)
      ? (row.artifacts as unknown as LiveMessage["artifacts"])
      : undefined,
    pending: meta.pending === true,
    statusKey: typeof meta.statusKey === "string" ? meta.statusKey : undefined,
    tone:
      meta.tone === "warning" || meta.tone === "error"
        ? meta.tone
        : undefined,
    runId,
    uiComponent,
    attachments: parseMessageAttachments(meta.attachments),
    createdAt: row.created_at,
  };
}

/* ----------------------------------------------------------------------- */
/* Knowledge / subscriptions                                                */
/* ----------------------------------------------------------------------- */

export function mapKnowledgeSource(row: KnowledgeSourceRow): KnowledgeSource {
  return {
    id: row.id,
    agentId: row.agent_id,
    kind: row.source_type as KnowledgeSource["kind"],
    name: row.name,
    status: row.status === "uploading" ? "pending" : (row.status as KnowledgeSource["status"]),
    createdAt: row.created_at,
  };
}

export function mapSubscription(row: SubscriptionRow): Subscription {
  const planKey =
    row.plan_key === "starter" ||
    row.plan_key === "pro" ||
    row.plan_key === "scale" ||
    row.plan_key === "free"
      ? row.plan_key
      : "free";
  const name =
    planKey === "free" ? "Free" : planKey.charAt(0).toUpperCase() + planKey.slice(1);
  const interval = row.billing_interval === "annual" ? "annual" : "monthly";
  const creditsMonthly = row.credits_monthly ?? undefined;
  const cancelAtPeriodEnd = Boolean(row.cancel_at_period_end);
  let pricePaidUsd: number | undefined;
  let nextPriceUsd: number | undefined;

  const raw =
    row.raw_payload && typeof row.raw_payload === "object"
      ? (row.raw_payload as Record<string, unknown>)
      : {};
  const rawPlan =
    raw.plan && typeof raw.plan === "object" ? (raw.plan as Record<string, unknown>) : {};
  const fromWhop =
    typeof rawPlan.renewal_price === "number"
      ? rawPlan.renewal_price
      : typeof raw.renewal_price === "number"
        ? raw.renewal_price
        : null;

  if (planKey !== "free" && creditsMonthly) {
    const priced = pricePlanSelection(planKey, interval, creditsMonthly);
    pricePaidUsd = fromWhop != null && fromWhop >= 0 ? fromWhop : priced.chargeUsd;
    nextPriceUsd = cancelAtPeriodEnd ? 0 : pricePaidUsd;
  }
  return {
    id: row.id,
    userId: row.user_id,
    provider: "whop",
    planId: planKey,
    planName: name,
    status: row.status as SubscriptionStatus,
    currentPeriodEnd: row.current_period_end ?? undefined,
    currentPeriodStart: row.current_period_start ?? undefined,
    planKey,
    billingInterval: interval,
    creditsMonthly,
    membershipId: row.provider_membership_id ?? undefined,
    providerPlanId: row.provider_plan_id ?? undefined,
    cancelAtPeriodEnd,
    pricePaidUsd,
    nextPriceUsd,
  };
}
