/**
 * Stack32 domain models (Phase 1).
 *
 * These mirror the Supabase schema (supabase/migrations) and the Python
 * agent-service Pydantic models. TODO(phase-3): replace the hand-written
 * mirrors with types generated from the agent-service OpenAPI schema
 * (@stack32/generated-api-types).
 */

import type { MessageAttachment } from "@/lib/chat/message-attachments";

export type { MessageAttachment };

export type AgentStatus =
  | "draft"
  | "building"
  | "built"
  | "ready"
  | "needs_attention"
  | "published"
  | "waiting_for_input"
  | "needs_setup"
  | "archived";

export type InstallationStatus = "setup_required" | "ready" | "needs_attention";

export interface AgentInstallation {
  id: string;
  agentId: string;
  userId: string;
  pinnedVersionId?: string;
  status: InstallationStatus;
  createdAt?: string;
  updatedAt?: string;
}

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "expired"
  | "inactive";

export interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export interface Profile {
  userId: string;
  firstName?: string;
  phone?: string;
  locale: string;
  onboardingCompleted: boolean;
  discoverySource?: string;
  role?: string;
  primaryUseCase?: string;
}

export interface Subscription {
  id: string;
  userId: string;
  provider: "whop";
  planId: string;
  planName: string;
  status: SubscriptionStatus;
  currentPeriodEnd?: string;
}

/** Product workspace — a container for agents. */
export interface Workspace {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** Mock credit usage shown in the profile menu until billing is wired. */
export interface CreditUsage {
  used: number;
  limit: number;
}

/**
 * Tool identifiers are free-form V4 strings (native, gmail_*, calendar_*, http_request, …).
 * @deprecated Prefer ToolBinding.toolId — kept as an alias for older ToolConfig usage.
 */
export type ToolId = string;

export type ApprovalMode = "never" | "always" | "conditional";

export interface ToolConfig {
  tool: ToolId;
  enabled: boolean;
}

/** V4 hybrid tool binding (mirrors agent-service ToolBinding). */
export interface ToolBinding {
  toolId: string;
  provider?: string;
  appId?: string;
  externalActionId?: string;
  version?: string;
  enabled: boolean;
  approvalMode?: ApprovalMode;
  config?: Record<string, unknown>;
  connectionRequirementId?: string;
}

export type ModelProfileId = "fast" | "standard" | "heavy";

export interface AgentSpec {
  schemaVersion: string;
  name: string;
  slug: string;
  goal: string;
  instructions: string;
  modelProfile: {
    profile: ModelProfileId;
    temperature: number;
  };
  tools: ToolConfig[];
  /** Richer V4 bindings when present on the stored spec. */
  toolBindings?: ToolBinding[];
  knowledge: {
    enabled: boolean;
    sourceIds: string[];
  };
  memory: {
    conversationWindow: number;
    conversationEnabled?: boolean;
    semanticEnabled?: boolean;
    writePolicy?: "never" | "explicit" | "automatic";
    retentionDays?: number;
  };
  rules: string[];
  output: {
    format: "markdown" | "table" | "text";
    allowTables: boolean;
  };
  starterPrompts: string[];
  runtime: {
    maxSteps: number;
    timeoutSeconds: number;
    maxToolCalls: number;
  };
  /** V2 identity block (optional — absent on V1 skeleton specs). */
  identity?: AgentIdentity;
  /** V2 execution graph (optional — absent on V1 skeleton specs). */
  graph?: GraphSpec;
  /** Exact BYOK model (schema 5.0). Structure shows this instead of the profile. */
  model?: { provider: string; modelId: string } | null;
  /** Chat/Schedule triggers (schema 5.0). Drives the Structure trigger node. */
  triggers?: AgentTrigger[];
}

export type TriggerKind = "chat" | "schedule" | "manual" | "webhook";

export interface AgentTrigger {
  kind: TriggerKind;
  enabled: boolean;
}

export interface AgentIdentity {
  name: string;
  role: string;
  description?: string;
  tone?: string;
}

export type GraphNodeType =
  | "input"
  | "guardrail"
  | "llm"
  | "router"
  | "tool"
  | "knowledge"
  | "memory_read"
  | "memory_write"
  | "approval"
  | "transform"
  | "sub_agent"
  | "output";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  name: string;
  description?: string;
  config?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface GraphSpec {
  version: string;
  entryNodeId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface AgentGraphResponse {
  graph: GraphSpec | null;
  schemaVersion?: string | null;
  identity?: AgentIdentity | null;
  testReady?: boolean;
}

export type TestStatus = "pending" | "passed" | "failed";

export interface AgentVersion {
  id: string;
  agentId: string;
  versionNumber: number;
  spec: AgentSpec;
  testStatus: TestStatus;
  createdAt: string;
}

export interface Agent {
  id: string;
  workspaceId: string;
  name: string;
  icon: string;
  status: AgentStatus;
  draftVersionId?: string;
  publishedVersionId?: string;
  createdAt: string;
  updatedAt: string;
}

/** State of an individual simulated build step. */
export type BuildStepState = "pending" | "running" | "done" | "failed";

export interface BuildStep {
  /** i18n key under builder:steps.* */
  labelKey: string;
  state: BuildStepState;
}

export type BuilderMessageTone = "normal" | "success" | "warning" | "error";

export type BuilderAction =
  | "test_agent"
  | "open_ai_agent"
  | "view_structure"
  | "fix_automatically"
  | "view_changes";

export interface BuilderUiComponentField {
  key: string;
  type: string;
  required: boolean;
  suggested_value?: string;
  options?: string[];
  label?: string;
}

export interface BuilderUiComponent {
  type:
    | "agent_identity_form"
    | "secret_form"
    | "agent_capabilities_form"
    | "dynamic_questions_form"
    | "provider_clarification_form"
    | "connection_form"
    | "approval_form";
  version: "1";
  requestId: string;
  context?: "builder" | "live";
  fields: BuilderUiComponentField[];
  /** connection_form: all apps the user must connect before build continues */
  connectionRequirements?: Array<{
    provider: string;
    appId?: string;
    toolIds?: string[];
  }>;
}

export interface BuildBoardNode {
  id: string;
  labelKey: string;
  state: BuildStepState;
}

export interface BuildBoardEdge {
  from: string;
  to: string;
}

export interface BuildBoard {
  nodes: BuildBoardNode[];
  edges: BuildBoardEdge[];
}

export interface BuilderSuggestion {
  id: string;
  labelKey: string;
  prompt?: string;
  action?: BuilderAction;
}

export interface IdentitySummary {
  name: string;
  role: string;
  tone?: string;
  description?: string;
}

export type BuilderCard = "identity_confirmed" | "build_progress" | "ready" | "thinking";

export interface BuilderMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  steps?: BuildStep[];
  actions?: BuilderAction[];
  tone?: BuilderMessageTone;
  uiComponent?: BuilderUiComponent;
  /** Run id when the builder is waiting on user input (identity form). */
  interruptRunId?: string;
  /** Play the first-ready chime once when this message arrives. */
  playReadySound?: boolean;
  formResolved?: boolean;
  card?: BuilderCard;
  identitySummary?: IdentitySummary;
  buildBoard?: BuildBoard;
  focus?: string;
  suggestions?: BuilderSuggestion[];
  /** Project files touched in this builder turn (for a simple beginner-friendly list). */
  projectFiles?: string[];
  /** Short human-readable problems when Fix it for me is offered. */
  detectedProblems?: string[];
  attachments?: MessageAttachment[];
  createdAt: string;
}

export interface BuilderThread {
  id: string;
  agentId: string;
  messages: BuilderMessage[];
}

export interface Citation {
  label: string;
  url: string;
}

export interface Artifact {
  kind: "markdown" | "table";
  title: string;
}

export interface LiveMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  artifacts?: Artifact[];
  /** True while the mock agent is still "working" on this reply. */
  pending?: boolean;
  /** i18n key under live:status.* describing the current tool activity. */
  statusKey?: string;
  uiComponent?: BuilderUiComponent;
  /** User-uploaded files / images shown as thumbnails above the bubble. */
  attachments?: MessageAttachment[];
  createdAt: string;
}

export interface LiveThread {
  id: string;
  agentId: string;
  messages: LiveMessage[];
}

export type RunKind = "build" | "live" | "test" | "repair" | "ingestion";
export type RunStatus = "queued" | "running" | "succeeded" | "failed";

export interface Run {
  id: string;
  agentId: string;
  kind: RunKind;
  status: RunStatus;
  createdAt: string;
}

export interface RunEvent {
  id: string;
  runId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface KnowledgeSource {
  id: string;
  agentId: string;
  kind: "file" | "url" | "text";
  name: string;
  status: "pending" | "processing" | "ready" | "failed";
  createdAt: string;
}

export interface AgentTest {
  id: string;
  agentId: string;
  versionId: string;
  status: "passed" | "failed";
  summary: string;
  createdAt: string;
}

export interface OnboardingAnswers {
  discoverySource?: string;
  role?: string;
  firstName?: string;
  phone?: string;
  primaryUseCase?: string;
}

/* ----------------------------------------------------------------------- */
/* Hybrid integrations readiness                                             */
/* ----------------------------------------------------------------------- */

export type ReadinessStatus = "ready" | "needs_setup" | "needs_attention";

export interface ReadinessCheck {
  key: string;
  ok: boolean;
  message: string;
  severity: "error" | "warn" | "info";
}

export interface ReadinessResult {
  status: ReadinessStatus;
  checks: ReadinessCheck[];
  missingConnections: Array<Record<string, unknown>>;
  missingConfig: Array<Record<string, unknown>>;
}
