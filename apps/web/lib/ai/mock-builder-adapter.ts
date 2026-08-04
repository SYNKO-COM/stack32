import "server-only";

import type { BuildStep } from "@/lib/domain/types";
import { specToDb } from "@/lib/domain/mappers";
import { makeSpecForPrompt } from "@/lib/repositories/mock/seed";
import { requireSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";

import type { BuilderExecutionAdapter, BuilderExecutionInput } from "./execution-adapter";

type Admin = ReturnType<typeof requireSupabaseAdminClient>;
type AgentStatus = Database["public"]["Tables"]["agents"]["Row"]["status"];

const STEP_KEYS = ["understanding", "capabilities", "building", "testing"];
const STEP_MS = 1100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Derive an agent name from the first prompt (mirrors the Phase 1 mock). */
function deriveAgentName(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes("sales") || lower.includes("lead")) return "Sales Research Agent";
  if (lower.includes("research") || lower.includes("competitor")) return "Research Agent";
  if (lower.includes("support") || lower.includes("document")) return "Docs Q&A Agent";
  if (lower.includes("report") || lower.includes("notes")) return "Report Writer Agent";
  return "Custom Agent";
}

async function setAgentStatus(admin: Admin, agentId: string, status: AgentStatus) {
  await admin.from("agents").update({ status }).eq("id", agentId);
}

async function appendRunEvent(
  admin: Admin,
  runId: string,
  sequence: number,
  eventType: string,
  label?: string,
) {
  await admin.from("run_events").insert({
    run_id: runId,
    sequence,
    event_type: eventType,
    label: label ?? null,
  });
}

/**
 * Simulates the approved Phase 1 build progression while persisting every
 * message, run and version through the service-role client (trusted server
 * code). NOT real AI — the resulting spec is a deterministic mock.
 */
export class MockBuilderExecutionAdapter implements BuilderExecutionAdapter {
  async execute({ userId, agentId, threadId, prompt }: BuilderExecutionInput): Promise<void> {
    const admin = requireSupabaseAdminClient();
    const isError = /\bfail\b/i.test(prompt);
    const isWarning = /\bwarn\b/i.test(prompt);

    await setAgentStatus(admin, agentId, "building");

    const { data: run } = await admin
      .from("runs")
      .insert({
        user_id: userId,
        agent_id: agentId,
        thread_id: threadId,
        run_type: "build",
        status: "running",
        input: { prompt } as Json,
        provider: "mock",
        model: "mock-builder",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    const runId = run?.id ?? null;
    if (runId) await appendRunEvent(admin, runId, 1, "run_started", "Build started");

    const steps: BuildStep[] = STEP_KEYS.map((labelKey, i) => ({
      labelKey,
      state: i === 0 ? "running" : "pending",
    }));

    const { data: message } = await admin
      .from("builder_messages")
      .insert({
        thread_id: threadId,
        agent_id: agentId,
        user_id: userId,
        role: "assistant",
        content: "",
        run_id: runId,
        metadata: { steps } as unknown as Json,
      })
      .select("id")
      .single();
    if (!message) throw new Error("assistant_message_insert_failed");

    for (let i = 0; i < STEP_KEYS.length; i++) {
      await sleep(STEP_MS);
      const next: BuildStep[] = STEP_KEYS.map((labelKey, j) => ({
        labelKey,
        state: j < i + 1 ? "done" : j === i + 1 ? "running" : "pending",
      }));
      if (isError && i === STEP_KEYS.length - 1) {
        next[next.length - 1] = { labelKey: STEP_KEYS[STEP_KEYS.length - 1], state: "failed" };
      }
      await admin
        .from("builder_messages")
        .update({ metadata: { steps: next } as unknown as Json })
        .eq("id", message.id);
      if (runId) {
        await appendRunEvent(admin, runId, i + 2, "step_completed", STEP_KEYS[i]);
      }
    }

    await sleep(STEP_MS);

    if (isError) {
      await setAgentStatus(admin, agentId, "needs_attention");
      await admin
        .from("builder_messages")
        .update({
          content: "builder:mock.errorResponse",
          metadata: {
            steps: STEP_KEYS.map((labelKey, i) => ({
              labelKey,
              state: i === STEP_KEYS.length - 1 ? "failed" : "done",
            })),
            tone: "error",
            actions: ["fix_automatically", "view_structure"],
          } as unknown as Json,
        })
        .eq("id", message.id);
      if (runId) {
        await admin
          .from("runs")
          .update({
            status: "failed",
            error_code: "mock_build_failed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", runId);
        await appendRunEvent(admin, runId, STEP_KEYS.length + 2, "run_failed");
      }
      return;
    }

    // Persist a new mock spec version and point the draft at it.
    const name = deriveAgentName(prompt);
    await this.persistSpecVersion(admin, agentId, userId, name, prompt, runId);

    const finalState = isWarning ? "needs_attention" : "ready";
    await setAgentStatus(admin, agentId, finalState);
    await admin
      .from("builder_messages")
      .update({
        content: isWarning ? "builder:mock.warningResponse" : "builder:mock.successResponse",
        metadata: {
          steps: STEP_KEYS.map((labelKey) => ({ labelKey, state: "done" })),
          tone: isWarning ? "warning" : "success",
          actions: isWarning
            ? ["test_agent", "view_structure", "fix_automatically"]
            : ["test_agent", "view_structure"],
        } as unknown as Json,
      })
      .eq("id", message.id);

    if (runId) {
      await admin
        .from("runs")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", runId);
      await appendRunEvent(admin, runId, STEP_KEYS.length + 2, "run_completed");
    }
  }

  async repair({ userId, agentId, threadId }: Omit<BuilderExecutionInput, "prompt">): Promise<void> {
    const admin = requireSupabaseAdminClient();
    await setAgentStatus(admin, agentId, "building");

    const { data: message } = await admin
      .from("builder_messages")
      .insert({
        thread_id: threadId,
        agent_id: agentId,
        user_id: userId,
        role: "assistant",
        content: "builder:mock.repairInProgress",
        metadata: { steps: [{ labelKey: "repairing", state: "running" }] } as unknown as Json,
      })
      .select("id")
      .single();
    if (!message) throw new Error("assistant_message_insert_failed");

    await sleep(2600);

    await this.persistSpecVersion(
      admin,
      agentId,
      userId,
      "Repaired Agent",
      "Repaired configuration",
      null,
    );
    await setAgentStatus(admin, agentId, "ready");
    await admin
      .from("builder_messages")
      .update({
        content: "builder:mock.repairResponse",
        metadata: {
          steps: [{ labelKey: "repairing", state: "done" }],
          tone: "success",
          actions: ["test_agent", "view_structure"],
        } as unknown as Json,
      })
      .eq("id", message.id);
  }

  private async persistSpecVersion(
    admin: Admin,
    agentId: string,
    userId: string,
    name: string,
    prompt: string,
    runId: string | null,
  ): Promise<void> {
    const { data: latest } = await admin
      .from("agent_versions")
      .select("version_number")
      .eq("agent_id", agentId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextNumber = (latest?.version_number ?? 0) + 1;

    const { data: version } = await admin
      .from("agent_versions")
      .insert({
        agent_id: agentId,
        version_number: nextNumber,
        spec: specToDb(makeSpecForPrompt(name, prompt)),
        change_summary: "Mock build (no real AI)",
        source_prompt: prompt,
        validation_status: "valid",
        test_status: "passed",
        model_provider: "mock",
        model_name: "mock-builder",
        created_by: userId,
      })
      .select("id")
      .single();

    if (version) {
      await admin
        .from("agents")
        .update({ draft_version_id: version.id, name })
        .eq("id", agentId);
      if (runId) {
        await admin.from("runs").update({ agent_version_id: version.id }).eq("id", runId);
      }
    }
  }
}
