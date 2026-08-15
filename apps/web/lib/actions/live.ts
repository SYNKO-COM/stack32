"use server";

import {
  currentAiExecutionMode,
  RealLiveExecutionAdapter,
  type LiveExecutionAdapter,
} from "@/lib/ai/execution-adapter";
import { cookies } from "next/headers";

import { MockLiveExecutionAdapter } from "@/lib/ai/mock-live-adapter";
import { LOCALE_COOKIE, readLocaleCookie } from "@/lib/i18n/locales";
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
  images?: Array<{ name: string; mimeType: string; dataBase64: string }>;
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

  const store = await cookies();
  const locale = readLocaleCookie(store.get(LOCALE_COOKIE)?.value);
  await getAdapter().execute({
    userId: user.id,
    locale,
    agentId: input.agentId,
    threadId: input.threadId,
    prompt: input.prompt,
    images: input.images,
  });
}

/** Stop the in-flight live run (composer Stop button). */
export async function cancelLiveRun(input: {
  agentId: string;
  runId?: string | null;
  /** When true, cancel without inserting a "canceled" chat message. */
  silent?: boolean;
}): Promise<{ status?: string }> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  if (currentAiExecutionMode() !== "agent-service") {
    return { status: "noop" };
  }

  const { agentServiceFetch, requireAccessToken } = await import(
    "@/lib/ai/agent-service-client"
  );
  const accessToken = await requireAccessToken();
  const silentQs = input.silent ? "?silent=1" : "";
  if (input.runId) {
    return agentServiceFetch(`/v1/runs/${input.runId}/cancel${silentQs}`, {
      method: "POST",
      accessToken,
      body: {},
    });
  }
  return agentServiceFetch(`/v1/agents/${input.agentId}/live/cancel${silentQs}`, {
    method: "POST",
    accessToken,
    body: {},
  });
}

/** Approve or deny a live side-effect, then resume the paused run. */
export async function decideLiveApproval(input: {
  agentId: string;
  approvalId: string;
  runId?: string | null;
  decision: "approved" | "denied";
}): Promise<{ ok: boolean }> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  if (currentAiExecutionMode() !== "agent-service") {
    throw new Error("approvals_unavailable");
  }

  const { agentServiceFetch, requireAccessToken } = await import(
    "@/lib/ai/agent-service-client"
  );
  const accessToken = await requireAccessToken();

  await agentServiceFetch(`/v1/approvals/${input.approvalId}/decide`, {
    method: "POST",
    accessToken,
    body: { decision: input.decision },
  });

  if (input.runId) {
    await agentServiceFetch(`/v1/live/runs/${input.runId}/resume`, {
      method: "POST",
      accessToken,
      body: {},
    });
  }

  return { ok: true };
}

