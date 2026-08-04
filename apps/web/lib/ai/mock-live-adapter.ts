import "server-only";

import { requireSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

import type { LiveExecutionAdapter, LiveExecutionInput } from "./execution-adapter";

const STATUS_SEQUENCE = ["searching", "reading", "analyzing", "preparing"];
const STATUS_MS = 900;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Realistic mock output: markdown, a table and clearly mocked citations. */
function buildMockAnswer(prompt: string): {
  content: string;
  citations: Json;
  artifacts: Json;
} {
  const content = [
    `Here is what I found based on your request:`,
    ``,
    `## Summary`,
    ``,
    `- I analyzed the request: "${prompt.slice(0, 140)}"`,
    `- I gathered the most relevant public information available.`,
    `- Confidence is **high** on the overview and **medium** on recent changes.`,
    ``,
    `## Key findings`,
    ``,
    `| Area | Finding | Confidence |`,
    `| --- | --- | --- |`,
    `| Overview | Consistent positioning across public sources | High |`,
    `| Activity | Two notable updates in the last 30 days | Medium |`,
    `| Risks | No blocking issue identified | Medium |`,
    ``,
    `## Suggested next step`,
    ``,
    `Ask me to go deeper on any specific point, or to format this as a report.`,
  ].join("\n");

  return {
    content,
    citations: [
      { label: "example.com — company overview (mock)", url: "https://example.com" },
      { label: "example.com/news — latest updates (mock)", url: "https://example.com/news" },
    ] as Json,
    artifacts: [{ kind: "table", title: "Key findings" }] as Json,
  };
}

/**
 * Simulated live run persisted through trusted server code. NOT a real agent:
 * statuses and the answer are deterministic mock data.
 */
export class MockLiveExecutionAdapter implements LiveExecutionAdapter {
  async execute({ userId, agentId, threadId, prompt }: LiveExecutionInput): Promise<void> {
    const admin = requireSupabaseAdminClient();

    const { data: run } = await admin
      .from("runs")
      .insert({
        user_id: userId,
        agent_id: agentId,
        thread_id: threadId,
        run_type: "live",
        status: "running",
        input: { prompt } as Json,
        provider: "mock",
        model: "mock-runtime",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    const runId = run?.id ?? null;

    const { data: message } = await admin
      .from("live_messages")
      .insert({
        thread_id: threadId,
        agent_id: agentId,
        user_id: userId,
        role: "assistant",
        content: "",
        run_id: runId,
        metadata: { pending: true, statusKey: STATUS_SEQUENCE[0] } as unknown as Json,
      })
      .select("id")
      .single();
    if (!message) throw new Error("assistant_message_insert_failed");

    for (let i = 0; i < STATUS_SEQUENCE.length; i++) {
      await admin
        .from("live_messages")
        .update({ metadata: { pending: true, statusKey: STATUS_SEQUENCE[i] } as unknown as Json })
        .eq("id", message.id);
      if (runId) {
        await admin.from("run_events").insert({
          run_id: runId,
          sequence: i + 1,
          event_type: "tool_status",
          label: STATUS_SEQUENCE[i],
        });
      }
      await sleep(STATUS_MS);
    }

    const answer = buildMockAnswer(prompt);
    await admin
      .from("live_messages")
      .update({
        content: answer.content,
        citations: answer.citations,
        artifacts: answer.artifacts,
        metadata: {} as Json,
      })
      .eq("id", message.id);

    if (runId) {
      await admin
        .from("runs")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", runId);
      await admin.from("run_events").insert({
        run_id: runId,
        sequence: STATUS_SEQUENCE.length + 1,
        event_type: "run_completed",
      });
    }
  }
}
