import type {
  Agent,
  AgentSpec,
  AgentVersion,
  BuilderMessage,
  KnowledgeSource,
  LiveMessage,
  Profile,
  Subscription,
  SubscriptionStatus,
  TestStatus,
  ToolId,
  User,
} from "@/lib/domain/types";
import type { Database, Json } from "@/lib/supabase/database.types";

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

export function mapProfile(row: ProfileRow, onboarding?: OnboardingRow | null): Profile {
  return {
    userId: row.id,
    firstName: row.first_name ?? undefined,
    phone: row.phone ?? undefined,
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

const KNOWN_TOOLS: ToolId[] = [
  "web_search",
  "fetch_url",
  "knowledge_search",
  "calculator",
  "current_datetime",
  "structured_output",
  "http_request",
];

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Convert a stored jsonb spec into the domain AgentSpec the UI renders.
 * Handles both the Phase 2 DB skeleton (snake_case) and specs already stored
 * in the domain shape (camelCase, produced by the mock builder).
 */
export function specFromDb(json: Json, fallbackName = "Untitled agent"): AgentSpec {
  const raw = asRecord(json);

  // Already in domain shape (mock builder output).
  if ("schemaVersion" in raw && "modelProfile" in raw) {
    return raw as unknown as AgentSpec;
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

  const tools = Array.isArray(raw.tools)
    ? raw.tools
        .map((t) => {
          if (typeof t === "string") return { tool: t as ToolId, enabled: true };
          const rec = asRecord(t);
          return {
            tool: (rec.tool ?? rec.id) as ToolId,
            enabled: rec.enabled !== false,
          };
        })
        .filter((t) => KNOWN_TOOLS.includes(t.tool))
    : [];

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

export function mapAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon_key ?? "sparkles",
    status:
      row.status === "archived" ? "draft" : (row.status as Agent["status"]),
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
    createdAt: row.created_at,
  };
}

export function mapLiveMessage(row: LiveMessageRow): LiveMessage | null {
  if (row.role !== "user" && row.role !== "assistant") return null;
  const meta = asRecord(row.metadata);
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
  return {
    id: row.id,
    userId: row.user_id,
    provider: "whop",
    planId: row.provider_plan_id ?? "",
    planName: row.provider_plan_id ?? "—",
    status: row.status as SubscriptionStatus,
    currentPeriodEnd: row.current_period_end ?? undefined,
  };
}
