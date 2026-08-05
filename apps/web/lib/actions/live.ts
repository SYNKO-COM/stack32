"use server";

import {
  currentAiExecutionMode,
  RealLiveExecutionAdapter,
  type LiveExecutionAdapter,
} from "@/lib/ai/execution-adapter";
import { MockLiveExecutionAdapter } from "@/lib/ai/mock-live-adapter";
import { requireSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

function getAdapter(): LiveExecutionAdapter {
  const mode = currentAiExecutionMode();
  if (mode === "mock") return new MockLiveExecutionAdapter();
  if (mode === "agent-service") return new RealLiveExecutionAdapter();
  return new RealLiveExecutionAdapter();
}

/**
 * Runs the live turn for an already-persisted user message.
 * Assistant messages are only ever inserted through trusted server code
 * (mock adapter) or the Agent Service (agent-service mode).
 */
export async function executeLiveTurn(input: {
  agentId: string;
  threadId: string;
  prompt: string;
}): Promise<void> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("id", input.agentId)
    .maybeSingle();
  if (!agent) throw new Error("agent_not_found");

  if (currentAiExecutionMode() === "disabled") {
    const admin = requireSupabaseAdminClient();
    await admin.from("live_messages").insert({
      thread_id: input.threadId,
      agent_id: input.agentId,
      user_id: user.id,
      role: "assistant",
      content: "live:execution.disabled",
      metadata: {} as Json,
    });
    return;
  }

  await getAdapter().execute({ userId: user.id, ...input });
}
