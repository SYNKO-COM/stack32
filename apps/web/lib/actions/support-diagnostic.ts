"use server";

import { getSubscriptionAccess, getCurrentUser, getCurrentProfile } from "@/lib/auth/guards";
import {
  formatSupportDiagnosticReport,
  sanitizeForSupport,
  type SupportDiagnosticPayload,
} from "@/lib/support/diagnostic-report";
import { requireSupabaseServerClient } from "@/lib/supabase/server";

export type GatherSupportDiagnosticInput = {
  agentId: string;
  surface: "builder" | "live";
  messageId: string;
  threadId?: string;
  runId?: string | null;
  errorKey?: string;
  errorSummary?: string;
  staleTimeout?: boolean;
  userPrompt?: string;
  pageUrl?: string;
  locale?: string;
  userAgent?: string;
};

function summarizeEventPayload(payload: Record<string, unknown>): string {
  const bits = [
    typeof payload.tool_id === "string" ? `tool=${payload.tool_id}` : null,
    typeof payload.code === "string" ? `code=${payload.code}` : null,
    typeof payload.error === "string" ? `error=${payload.error}` : null,
    typeof payload.message === "string" ? `message=${payload.message}` : null,
    typeof payload.path === "string" ? `path=${payload.path}` : null,
  ].filter(Boolean);
  return bits.join(" · ");
}

function extractToolIds(spec: unknown): string[] {
  if (!spec || typeof spec !== "object") return [];
  const tools = (spec as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) return [];
  const ids: string[] = [];
  for (const t of tools) {
    if (t && typeof t === "object") {
      const tid = (t as { tool_id?: string; toolId?: string }).tool_id
        ?? (t as { toolId?: string }).toolId;
      if (typeof tid === "string" && tid.trim()) ids.push(tid.trim());
    }
  }
  return ids;
}

export async function gatherSupportDiagnostic(
  input: GatherSupportDiagnosticInput,
): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("not_authenticated");

  const supabase = await requireSupabaseServerClient();
  const profile = await getCurrentProfile();
  const access = await getSubscriptionAccess();

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id, name, status, slug, draft_version_id")
    .eq("id", input.agentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (agentError || !agent) throw new Error("agent_not_found");

  let runId = input.runId?.trim() || null;
  if (!runId) {
    const { data: latestRun } = await supabase
      .from("runs")
      .select("id")
      .eq("agent_id", input.agentId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    runId = latestRun?.id ?? null;
  }

  let runBlock: SupportDiagnosticPayload["run"] = null;
  let runEvents: SupportDiagnosticPayload["runEvents"] = [];

  if (runId) {
    const { data: run } = await supabase
      .from("runs")
      .select(
        "id, run_type, status, error_code, error_message, model, provider, started_at, completed_at, input",
      )
      .eq("id", runId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (run) {
      runBlock = {
        id: run.id,
        type: run.run_type,
        status: run.status,
        errorCode: run.error_code,
        errorMessage: run.error_message,
        model: run.model,
        provider: run.provider,
        startedAt: run.started_at,
        completedAt: run.completed_at,
      };
    }

    const { data: events } = await supabase
      .from("run_events")
      .select("event_type, payload, sequence")
      .eq("run_id", runId)
      .order("sequence", { ascending: true })
      .limit(80);
    runEvents =
      events?.map((row) => {
        const payload =
          row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
            ? (sanitizeForSupport(row.payload) as Record<string, unknown>)
            : {};
        return {
          sequence: Number(row.sequence ?? 0),
          eventType: String(row.event_type ?? ""),
          summary: summarizeEventPayload(payload),
        };
      }) ?? [];
  }

  let tools: string[] = [];
  if (agent.draft_version_id) {
    const { data: version } = await supabase
      .from("agent_versions")
      .select("spec")
      .eq("id", agent.draft_version_id)
      .eq("agent_id", agent.id)
      .maybeSingle();
    tools = extractToolIds(version?.spec);
  }

  const sub = access.subscription;
  const payload: SupportDiagnosticPayload = {
    reportId: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
    account: {
      userId: user.id,
      email: user.email,
      username: profile?.username ?? null,
    },
    billing: {
      planKey: sub?.plan_key ?? "free",
      planStatus: sub?.status ?? "none",
      billingInterval: sub?.billing_interval ?? null,
      creditsMonthly: sub?.credits_monthly ?? null,
    },
    context: {
      surface: input.surface,
      pageUrl: input.pageUrl,
      locale: input.locale,
      userAgent: input.userAgent?.slice(0, 500),
    },
    agent: {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      slug: agent.slug,
    },
    request: {
      userPrompt: input.userPrompt?.trim() || null,
      threadId: input.threadId ?? null,
      messageId: input.messageId,
    },
    error: {
      key: input.errorKey ?? null,
      summary: input.errorSummary ?? null,
      staleTimeout: input.staleTimeout,
    },
    run: runBlock,
    tools,
    runEvents,
  };

  return formatSupportDiagnosticReport(payload);
}
