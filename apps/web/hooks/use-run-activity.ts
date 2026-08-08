"use client";

import { useQuery } from "@tanstack/react-query";

import { requireSupabaseBrowserClient } from "@/lib/supabase/client";

export type RunActivityEvent = {
  eventType: string;
  sequence: number;
  path?: string;
  mappingKey?: string;
  createdAt?: string;
};

/**
 * Live run_events for the active Builder run — powers Cursor-style activity lines.
 */
export function useRunActivity(runId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["run-activity", runId],
    enabled: Boolean(runId) && enabled,
    refetchInterval: enabled ? 600 : false,
    queryFn: async (): Promise<RunActivityEvent[]> => {
      if (!runId) return [];
      const supabase = requireSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("run_events")
        .select("event_type, payload, sequence, created_at")
        .eq("run_id", runId)
        .order("sequence", { ascending: true })
        .limit(80);
      if (error) throw error;
      return (data ?? []).map((row) => {
        const payload =
          row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : {};
        return {
          eventType: String(row.event_type ?? ""),
          sequence: Number(row.sequence ?? 0),
          path: typeof payload.path === "string" ? payload.path : undefined,
          mappingKey:
            typeof payload.mapping_key === "string" ? payload.mapping_key : undefined,
          createdAt: row.created_at ?? undefined,
        };
      });
    },
  });
}

/** Collapse raw events into Cursor-like status lines. */
export function summarizeActivity(events: RunActivityEvent[]): {
  lines: { id: string; text: string; active: boolean }[];
} {
  const fileCreates = events.filter((e) =>
    e.eventType.includes("file.created") || e.eventType.includes("file.write"),
  );
  const fileReads = events.filter((e) => e.eventType.includes("file.read"));
  const searches = events.filter(
    (e) =>
      e.eventType.includes("context.search") ||
      e.eventType.includes("context.indexing"),
  );

  const lines: { id: string; text: string; active: boolean }[] = [];
  const seen = new Set<string>();

  const push = (id: string, text: string, active = false) => {
    if (seen.has(id)) return;
    seen.add(id);
    lines.push({ id, text, active });
  };

  if (fileReads.length > 0) {
    push(
      "reads",
      fileReads.length === 1
        ? `Read ${fileReads[0]?.path ?? "a file"}`
        : `Explored ${fileReads.length} files`,
    );
  }
  if (fileCreates.length > 0) {
    push(
      "writes",
      fileCreates.length === 1
        ? `Wrote ${fileCreates[0]?.path ?? "a file"}`
        : `Wrote ${fileCreates.length} files`,
    );
  }
  if (searches.length > 0) {
    push(
      "search",
      searches.length === 1
        ? "Indexed project context"
        : `Explored context · ${searches.length} searches`,
    );
  }

  // Prefer high-signal milestones (avoid one line per tiny event).
  const milestones: { match: (t: string) => boolean; text: string; id: string }[] = [
    { id: "understood", match: (t) => t.includes("analysis") || t.includes("understanding"), text: "Understood your request" },
    { id: "planning", match: (t) => t.includes("plan.created") || t.includes("architecture"), text: "Planning next moves" },
    { id: "identity", match: (t) => t.includes("identity"), text: "Confirmed identity" },
    { id: "spec", match: (t) => t.includes("spec.updated"), text: "Updated agent instructions" },
    { id: "graph", match: (t) => t.includes("graph.updated"), text: "Updated structure" },
    { id: "validation", match: (t) => t.includes("validation"), text: "Checked configuration" },
    { id: "tests-run", match: (t) => t.includes("test.started") || t.includes("tests.started"), text: "Running tests" },
    { id: "tests-ok", match: (t) => t.includes("test.completed") || t.includes("tests.passed"), text: "Tests passed" },
    { id: "tests-fail", match: (t) => t.includes("tests.failed"), text: "Tests failed — inspecting" },
    { id: "repair", match: (t) => t.includes("repair"), text: "Repairing" },
    { id: "sandbox", match: (t) => t.includes("sandbox"), text: "Sandbox ready" },
    { id: "scaffold", match: (t) => t.includes("scaffolding") || t.includes("project.scaffolding"), text: "Scaffolding project" },
    { id: "snapshot", match: (t) => t.includes("snapshot"), text: "Snapshot created" },
    { id: "thinking", match: (t) => t.includes("model.call") || t.includes("builder.model"), text: "Thinking" },
  ];

  for (const m of milestones) {
    if (events.some((e) => m.match(e.eventType))) {
      push(m.id, m.text);
    }
  }

  if (lines.length === 0) {
    push("boot", "Planning next moves", true);
    return { lines };
  }

  // Keep the feed compact like Cursor (last ~8 lines).
  const compact = lines.slice(-8);
  const last = compact[compact.length - 1];
  if (last) last.active = true;
  return { lines: compact };
}
