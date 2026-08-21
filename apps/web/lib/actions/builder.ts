"use server";

import {
  agentServiceFetch,
  requireAccessToken,
} from "@/lib/ai/agent-service-client";
import {
  currentAiExecutionMode,
  RealBuilderExecutionAdapter,
  type BuilderExecutionAdapter,
} from "@/lib/ai/execution-adapter";
import { MockBuilderExecutionAdapter } from "@/lib/ai/mock-builder-adapter";
import { cookies } from "next/headers";

import { LOCALE_COOKIE, readLocaleCookie } from "@/lib/i18n/locales";
import { requireSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { AgentServiceError } from "@/lib/ai/agent-service-errors";

/** UI language chosen in settings — the assistant must always reply in it. */
async function currentLocale(): Promise<string> {
  const store = await cookies();
  return readLocaleCookie(store.get(LOCALE_COOKIE)?.value);
}

function getAdapter(): BuilderExecutionAdapter {
  const mode = currentAiExecutionMode();
  if (mode === "mock") return new MockBuilderExecutionAdapter();
  if (mode === "agent-service") return new RealBuilderExecutionAdapter();
  return new RealBuilderExecutionAdapter();
}

async function requireOwnedAgent(agentId: string): Promise<{ userId: string }> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent) throw new Error("agent_not_found");
  return { userId: user.id };
}

async function insertDisabledNotice(
  userId: string,
  agentId: string,
  threadId: string,
): Promise<void> {
  const admin = requireSupabaseAdminClient();
  await admin.from("builder_messages").insert({
    thread_id: threadId,
    agent_id: agentId,
    user_id: userId,
    role: "assistant",
    content: "builder:mock.executionDisabled",
    metadata: { tone: "warning" } as unknown as Json,
  });
}

/**
 * Runs the builder turn for an already-persisted user message.
 * Assistant messages are only ever inserted through trusted server code
 * (mock adapter) or the Agent Service (agent-service mode).
 */
export async function executeBuilderTurn(input: {
  agentId: string;
  threadId: string;
  prompt: string;
  images?: Array<{ name: string; mimeType: string; dataBase64: string }>;
  mode?: "build" | "chat";
}): Promise<void> {
  const { userId } = await requireOwnedAgent(input.agentId);
  if (currentAiExecutionMode() === "disabled") {
    await insertDisabledNotice(userId, input.agentId, input.threadId);
    return;
  }

  const admin = requireSupabaseAdminClient();
  // Immediate "thinking" bubble only — do NOT set status=building yet.
  // Setting building early made the Agent Service skip the identity form
  // (is_first became false while a default "Untitled agent" draft already exists).
  const { data: thinking } = await admin
    .from("builder_messages")
    .insert({
      thread_id: input.threadId,
      agent_id: input.agentId,
      user_id: userId,
      role: "assistant",
      content: "",
      metadata: {
        card: "thinking",
        tone: "normal",
        focus: "working.activities.reading",
      } as unknown as Json,
    })
    .select("id")
    .single();

  try {
    await getAdapter().execute({
      userId,
      locale: await currentLocale(),
      agentId: input.agentId,
      threadId: input.threadId,
      prompt: input.prompt,
      images: input.images,
      mode: input.mode ?? "build",
    });
  } catch (err) {
    const contentKey =
      err instanceof AgentServiceError && err.code === "AGENT_SERVICE_UNAVAILABLE"
        ? "builder:errors.serviceUnavailable"
        : "builder:errors.buildFailedDetail";
    if (thinking?.id) {
      await admin
        .from("builder_messages")
        .update({
          content: contentKey,
          metadata: { tone: "warning" } as unknown as Json,
        })
        .eq("id", thinking.id);
    } else {
      await admin.from("builder_messages").insert({
        thread_id: input.threadId,
        agent_id: input.agentId,
        user_id: userId,
        role: "assistant",
        content: contentKey,
        metadata: { tone: "warning" } as unknown as Json,
      });
    }
    // Error is persisted — do not fail the client mutation (avoids reverting the thread).
    return;
  }
}

/** Automatic repair ("Fix automatically" action). */
export async function executeBuilderRepair(input: {
  agentId: string;
  threadId: string;
}): Promise<void> {
  const { userId } = await requireOwnedAgent(input.agentId);
  if (currentAiExecutionMode() === "disabled") {
    await insertDisabledNotice(userId, input.agentId, input.threadId);
    return;
  }
  await getAdapter().repair({ userId, locale: await currentLocale(), ...input });
}

/** Resume a builder run after the user submits the identity form. */
export async function submitBuilderIdentity(input: {
  runId: string;
  name: string;
  role: string;
  tone: string;
  description: string;
  requestId?: string;
}): Promise<void> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  if (currentAiExecutionMode() !== "agent-service") {
    throw new Error("identity_requires_agent_service");
  }

  const accessToken = await requireAccessToken();
  await agentServiceFetch(`/v1/builder/runs/${input.runId}/identity`, {
    method: "POST",
    accessToken,
    body: {
      name: input.name,
      role: input.role,
      tone: input.tone,
      description: input.description,
      request_id: input.requestId ?? input.runId,
    },
  });
}

/** Resume builder after the user connects an LLM via Pipedream (or legacy key). */
export async function submitBuilderSecret(input: {
  runId: string;
  provider: string;
  apiKey?: string;
  modelId?: string;
}): Promise<void> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  if (currentAiExecutionMode() !== "agent-service") {
    throw new Error("secrets_require_agent_service");
  }
  const accessToken = await requireAccessToken();
  await agentServiceFetch(`/v1/builder/runs/${input.runId}/secret`, {
    method: "POST",
    accessToken,
    body: {
      provider: input.provider,
      api_key: input.apiKey || "",
      model_id: input.modelId,
    },
  });
}

/** Store a Live BYOK key without resuming a builder run. */
export async function submitLiveLlmSecret(input: {
  agentId: string;
  provider: string;
  apiKey: string;
  modelId?: string;
}): Promise<void> {
  await requireOwnedAgent(input.agentId);
  if (currentAiExecutionMode() !== "agent-service") {
    throw new Error("secrets_require_agent_service");
  }
  const accessToken = await requireAccessToken();
  await agentServiceFetch(`/v1/agents/${input.agentId}/secrets/llm`, {
    method: "POST",
    accessToken,
    body: {
      provider: input.provider,
      api_key: input.apiKey,
      scope: "agent",
      model_id: input.modelId,
    },
  });
}

/** Persist the exact provider/model on the agent spec (key already stored). */
export async function updateAgentModel(input: {
  agentId: string;
  provider: string;
  modelId: string;
}): Promise<void> {
  await requireOwnedAgent(input.agentId);
  if (currentAiExecutionMode() !== "agent-service") {
    throw new Error("secrets_require_agent_service");
  }
  const accessToken = await requireAccessToken();
  await agentServiceFetch(`/v1/agents/${input.agentId}/model`, {
    method: "PATCH",
    accessToken,
    body: {
      provider: input.provider,
      model_id: input.modelId,
    },
  });
}

/** Persist Chat/Schedule triggers from Structure (adds/removes timed schedule). */
export async function updateAgentTriggers(input: {
  agentId: string;
  scheduleHourly?: boolean;
  cron?: string | null;
  timezone?: string | null;
  triggers?: Array<{
    kind: string;
    enabled?: boolean;
    cron?: string | null;
    timezone?: string | null;
    appId?: string | null;
    componentId?: string | null;
    label?: string | null;
    extraProps?: Record<string, unknown>;
    connectionId?: string | null;
  }>;
}): Promise<{ triggers: Array<{ kind: string; enabled: boolean; cron?: string | null; timezone?: string | null }> }> {
  await requireOwnedAgent(input.agentId);
  if (currentAiExecutionMode() !== "agent-service") {
    throw new Error("triggers_require_agent_service");
  }
  const accessToken = await requireAccessToken();
  const body: Record<string, unknown> = {};
  if (input.scheduleHourly !== undefined) body.schedule_hourly = input.scheduleHourly;
  if (input.cron !== undefined) body.cron = input.cron;
  if (input.timezone !== undefined) body.timezone = input.timezone;
  if (input.triggers !== undefined) {
    body.triggers = input.triggers.map((t) => ({
      kind: t.kind,
      enabled: t.enabled,
      cron: t.cron,
      timezone: t.timezone,
      app_id: t.appId,
      component_id: t.componentId,
      label: t.label,
      extra_props: t.extraProps,
      connection_id: t.connectionId,
    }));
  }
  return agentServiceFetch(`/v1/agents/${input.agentId}/triggers`, {
    method: "PATCH",
    accessToken,
    body,
  });
}

export async function getAgentTriggerRuntime(agentId: string): Promise<{
  configured: boolean;
  status: string;
  mode: string;
  listeningUntil?: string | null;
  lastEventAt?: string | null;
  appId?: string | null;
  componentId?: string | null;
}> {
  await requireOwnedAgent(agentId);
  if (currentAiExecutionMode() !== "agent-service") {
    return { configured: false, status: "idle", mode: "listen" };
  }
  const accessToken = await requireAccessToken();
  const result = await agentServiceFetch<{
    configured?: boolean;
    status?: string;
    mode?: string;
    listening_until?: string | null;
    last_event_at?: string | null;
    app_id?: string | null;
    component_id?: string | null;
  }>(`/v1/agents/${agentId}/triggers/runtime`, { method: "GET", accessToken });
  return {
    configured: result.configured === true,
    status: result.status || "idle",
    mode: result.mode || "listen",
    listeningUntil: result.listening_until,
    lastEventAt: result.last_event_at,
    appId: result.app_id,
    componentId: result.component_id,
  };
}

export async function startAgentTriggerListen(agentId: string): Promise<{
  status: string;
  mode: string;
  listeningUntil?: string | null;
  windowSeconds?: number;
}> {
  await requireOwnedAgent(agentId);
  if (currentAiExecutionMode() !== "agent-service") {
    throw new Error("triggers_require_agent_service");
  }
  const accessToken = await requireAccessToken();
  const result = await agentServiceFetch<{
    status?: string;
    mode?: string;
    listening_until?: string | null;
    window_seconds?: number;
  }>(`/v1/agents/${agentId}/triggers/listen`, { method: "POST", accessToken, body: {} });
  return {
    status: result.status || "listening",
    mode: result.mode || "listen",
    listeningUntil: result.listening_until,
    windowSeconds: result.window_seconds,
  };
}

/** Persist memory settings from Structure (conversation / semantic / provider). */
export async function updateAgentMemorySettings(input: {
  agentId: string;
  conversationEnabled?: boolean;
  semanticEnabled?: boolean;
  writePolicy?: "never" | "explicit" | "automatic";
  retentionDays?: number;
  provider?: "stack32" | "external_postgres";
  conversationWindow?: number;
  externalAppId?: string | null;
  externalInstructions?: string | null;
}): Promise<void> {
  await requireOwnedAgent(input.agentId);
  if (currentAiExecutionMode() !== "agent-service") {
    throw new Error("memory_require_agent_service");
  }
  const accessToken = await requireAccessToken();
  const body: Record<string, unknown> = {};
  if (input.conversationEnabled !== undefined) {
    body.conversation_enabled = input.conversationEnabled;
  }
  if (input.semanticEnabled !== undefined) {
    body.semantic_enabled = input.semanticEnabled;
  }
  if (input.writePolicy !== undefined) body.write_policy = input.writePolicy;
  if (input.retentionDays !== undefined) body.retention_days = input.retentionDays;
  if (input.provider !== undefined) body.provider = input.provider;
  if (input.conversationWindow !== undefined) {
    body.conversation_window = input.conversationWindow;
  }
  if (input.externalAppId !== undefined) {
    body.external_app_id = input.externalAppId;
  }
  if (input.externalInstructions !== undefined) {
    body.external_instructions = input.externalInstructions;
  }
  await agentServiceFetch(`/v1/agents/${input.agentId}/memory-settings`, {
    method: "PATCH",
    accessToken,
    body,
  });
}

/** Resume builder after capabilities / memory form. */
export async function submitBuilderCapabilities(input: {
  runId: string;
  memoryConversation: boolean;
  memorySemantic: boolean;
  knowledgeEnabled: boolean;
  scheduleHourly?: boolean;
  toolTrigger?: boolean;
  toolTriggerAppId?: string | null;
  toolTriggerComponentId?: string | null;
  toolTriggerLabel?: string | null;
  contextNotes: string;
}): Promise<void> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  if (currentAiExecutionMode() !== "agent-service") {
    throw new Error("capabilities_require_agent_service");
  }
  const accessToken = await requireAccessToken();
  await agentServiceFetch(`/v1/builder/runs/${input.runId}/capabilities`, {
    method: "POST",
    accessToken,
    body: {
      memory_conversation: input.memoryConversation,
      memory_semantic: input.memorySemantic,
      knowledge_enabled: input.knowledgeEnabled,
      schedule_hourly: input.scheduleHourly ?? false,
      tool_trigger: input.toolTrigger ?? false,
      tool_trigger_app_id: input.toolTriggerAppId || null,
      tool_trigger_component_id: input.toolTriggerComponentId || null,
      tool_trigger_label: input.toolTriggerLabel || null,
      context_notes: input.contextNotes,
    },
  });
}

/** Resume builder after required app connections are linked. */
export async function resumeBuilderConnection(input: {
  runId?: string;
  agentId: string;
}): Promise<{ status?: string }> {
  if (currentAiExecutionMode() !== "agent-service") {
    return { status: "noop" };
  }
  const accessToken = await requireAccessToken();
  if (input.runId) {
    return agentServiceFetch(`/v1/builder/runs/${input.runId}/connection`, {
      method: "POST",
      accessToken,
      body: {},
    });
  }
  return agentServiceFetch(`/v1/agents/${input.agentId}/builder/resume-connection`, {
    method: "POST",
    accessToken,
    body: {},
  });
}

/** Resume builder after dynamic clarifying questions. */
export async function submitBuilderQuestions(input: {
  runId: string;
  answers: Record<string, string>;
}): Promise<void> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  if (currentAiExecutionMode() !== "agent-service") {
    throw new Error("questions_require_agent_service");
  }
  const accessToken = await requireAccessToken();
  await agentServiceFetch(`/v1/builder/runs/${input.runId}/questions`, {
    method: "POST",
    accessToken,
    body: { answers: input.answers },
  });
}

/** Resume builder after mandatory tool review (add/remove confirmation). */
export async function submitBuilderToolReview(input: {
  runId: string;
  tools: Array<{
    toolId: string;
    provider: string;
    appId?: string;
    externalActionId?: string;
    utility: string;
    toolIds?: string[];
  }>;
}): Promise<void> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  if (currentAiExecutionMode() !== "agent-service") {
    throw new Error("tool_review_requires_agent_service");
  }
  const accessToken = await requireAccessToken();
  await agentServiceFetch(`/v1/builder/runs/${input.runId}/tools`, {
    method: "POST",
    accessToken,
    body: {
      tools: input.tools.map((t) => ({
        tool_id: t.toolId,
        provider: t.provider,
        app_id: t.appId ?? null,
        external_action_id: t.externalActionId ?? null,
        utility: t.utility,
        tool_ids: t.toolIds ?? [],
      })),
    },
  });
}

/** Resume builder after provider clarification (email/CRM apps). */
export async function submitBuilderProviders(input: {
  runId: string;
  answers: Record<string, string>;
}): Promise<void> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  if (currentAiExecutionMode() !== "agent-service") {
    throw new Error("providers_require_agent_service");
  }
  const accessToken = await requireAccessToken();
  await agentServiceFetch(`/v1/builder/runs/${input.runId}/providers`, {
    method: "POST",
    accessToken,
    body: { answers: input.answers },
  });
}

/** Stop the in-flight Builder run (square Stop button). */
export async function cancelBuilderRun(input: {
  agentId: string;
}): Promise<{ status: string; id?: string }> {
  const { userId } = await requireOwnedAgent(input.agentId);
  if (currentAiExecutionMode() !== "agent-service") {
    return { status: "idle" };
  }

  try {
    const accessToken = await requireAccessToken();
    return await agentServiceFetch<{ status: string; id?: string }>(
      `/v1/agents/${input.agentId}/builder/cancel`,
      {
        method: "POST",
        accessToken,
      },
    );
  } catch {
    // Agent service down / unreachable — still clear local run state so Stop resets the UI.
    return localCancelBuilderRun({ agentId: input.agentId, userId });
  }
}

/** Best-effort cancel when Agent Service is unreachable. */
async function localCancelBuilderRun(input: {
  agentId: string;
  userId: string;
}): Promise<{ status: string; id?: string }> {
  const admin = requireSupabaseAdminClient();
  const { data: actives } = await admin
    .from("runs")
    .select("id,thread_id,status")
    .eq("agent_id", input.agentId)
    .eq("user_id", input.userId)
    .eq("run_type", "build")
    .in("status", ["queued", "running", "waiting_for_input"])
    .order("created_at", { ascending: false })
    .limit(20);

  const rows = actives ?? [];
  if (rows.length === 0) {
    await admin
      .from("agents")
      .update({ status: "draft" })
      .eq("id", input.agentId)
      .eq("user_id", input.userId)
      .in("status", ["building", "waiting_for_input"]);
    return { status: "idle" };
  }

  let lastId: string | undefined;
  let threadId: string | null = null;
  for (const active of rows) {
    if (!active?.id) continue;
    lastId = active.id;
    threadId = active.thread_id ?? threadId;
    await admin
      .from("runs")
      .update({
        status: "canceled",
        completed_at: new Date().toISOString(),
        error_code: null,
      })
      .eq("id", active.id)
      .eq("user_id", input.userId);

    await admin
      .from("run_queue")
      .update({ status: "dead", last_error: "canceled_by_user" })
      .eq("run_id", active.id)
      .in("status", ["pending", "leased"]);
  }

  await admin
    .from("agents")
    .update({ status: "draft" })
    .eq("id", input.agentId)
    .eq("user_id", input.userId)
    .in("status", ["building", "waiting_for_input"]);

  if (threadId && lastId) {
    await admin.from("builder_messages").insert({
      thread_id: threadId,
      agent_id: input.agentId,
      user_id: input.userId,
      role: "assistant",
      content: "builder:errors.canceledDetail",
      metadata: { tone: "normal", interrupt_run_id: lastId } as unknown as Json,
    });
  }

  return { status: "canceled", id: lastId };
}
