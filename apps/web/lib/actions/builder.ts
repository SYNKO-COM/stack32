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
import { requireSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

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
  await admin.from("builder_messages").insert({
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
  });

  await getAdapter().execute({ userId, ...input });
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
  await getAdapter().repair({ userId, ...input });
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

/** Resume builder after the user stores a BYOK LLM key. */
export async function submitBuilderSecret(input: {
  runId: string;
  provider: string;
  apiKey: string;
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
      api_key: input.apiKey,
    },
  });
}

/** Store a Live BYOK key without resuming a builder run. */
export async function submitLiveLlmSecret(input: {
  agentId: string;
  provider: string;
  apiKey: string;
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
    },
  });
}

/** Resume builder after capabilities / memory form. */
export async function submitBuilderCapabilities(input: {
  runId: string;
  memoryConversation: boolean;
  memorySemantic: boolean;
  knowledgeEnabled: boolean;
  scheduleHourly?: boolean;
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
      context_notes: input.contextNotes,
    },
  });
}
