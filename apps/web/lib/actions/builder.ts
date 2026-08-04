"use server";

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
  // "disabled" is handled before the adapter is reached.
  return currentAiExecutionMode() === "mock"
    ? new MockBuilderExecutionAdapter()
    : new RealBuilderExecutionAdapter();
}

async function requireOwnedAgent(agentId: string): Promise<{ userId: string }> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  // RLS-scoped read: returns null unless the caller owns the active agent.
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
 * Runs the (mock) builder turn for an already-persisted user message.
 * Assistant messages are only ever inserted here, through trusted server code.
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
  await getAdapter().execute({ userId, ...input });
}

/** Mock automatic repair ("Fix automatically" action). */
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
