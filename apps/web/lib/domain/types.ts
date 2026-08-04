/**
 * Stack32 domain models (Phase 1).
 *
 * These mirror the Supabase schema (supabase/migrations) and the Python
 * agent-service Pydantic models. TODO(phase-3): replace the hand-written
 * mirrors with types generated from the agent-service OpenAPI schema
 * (@stack32/generated-api-types).
 */

export type AgentStatus =
  | "draft"
  | "building"
  | "ready"
  | "needs_attention"
  | "published";

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

export type ToolId =
  | "web_search"
  | "fetch_url"
  | "knowledge_search"
  | "calculator"
  | "current_datetime"
  | "structured_output"
  | "http_request";

export interface ToolConfig {
  tool: ToolId;
  enabled: boolean;
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
  knowledge: {
    enabled: boolean;
    sourceIds: string[];
  };
  memory: {
    conversationWindow: number;
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

export type BuilderAction = "test_agent" | "view_structure" | "fix_automatically";

export interface BuilderMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  steps?: BuildStep[];
  actions?: BuilderAction[];
  tone?: BuilderMessageTone;
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
