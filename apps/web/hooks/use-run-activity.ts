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

export type ActivityLineSpec = {
  id: string;
  /** i18n key under builder:activity.* */
  key: string;
  params?: Record<string, string | number>;
  active?: boolean;
};

/**
 * Live run_events for the active Builder run — powers Cursor-style activity lines.
 */
export function useRunActivity(runId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["run-activity", runId],
    enabled: Boolean(runId) && enabled,
    refetchInterval: enabled ? 2500 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    staleTime: 2000,
    notifyOnChangeProps: ["data", "error"],
    // Never blank the feed while a refetch is in flight.
    placeholderData: (prev) => prev,
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

function shortPath(path?: string): string {
  if (!path) return "";
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

/** Collapse raw events into Cursor-like status line specs (i18n keys). */
export function summarizeActivity(
  events: RunActivityEvent[],
  opts?: { readOnly?: boolean },
): {
  lines: ActivityLineSpec[];
} {
  const readOnly = Boolean(opts?.readOnly);
  const fileCreates = readOnly
    ? []
    : events.filter(
        (e) => e.eventType.includes("file.created") || e.eventType.includes("file.write"),
      );
  const fileReads = events.filter((e) => e.eventType.includes("file.read"));
  const searches = events.filter(
    (e) =>
      e.eventType.includes("context.search") || e.eventType.includes("context.indexing"),
  );

  const lines: (ActivityLineSpec & { order: number })[] = [];
  const seen = new Set<string>();

  const firstSequence = (matching: RunActivityEvent[]): number =>
    matching.reduce((min, e) => Math.min(min, e.sequence), Number.MAX_SAFE_INTEGER);

  const push = (spec: ActivityLineSpec, order: number) => {
    if (seen.has(spec.id)) return;
    seen.add(spec.id);
    lines.push({ ...spec, order });
  };

  if (fileReads.length > 0) {
    push(
      fileReads.length === 1
        ? {
            id: "reads",
            key: "readOne",
            params: { path: shortPath(fileReads[0]?.path) || "…" },
          }
        : { id: "reads", key: "readMany", params: { count: fileReads.length } },
      firstSequence(fileReads),
    );
  }
  if (fileCreates.length > 0) {
    push(
      fileCreates.length === 1
        ? {
            id: "writes",
            key: "wroteOne",
            params: { path: shortPath(fileCreates[0]?.path) || "…" },
          }
        : { id: "writes", key: "wroteMany", params: { count: fileCreates.length } },
      firstSequence(fileCreates),
    );
  }
  if (searches.length > 0) {
    push(
      searches.length === 1
        ? { id: "search", key: "indexed" }
        : { id: "search", key: "searched", params: { count: searches.length } },
      firstSequence(searches),
    );
  }

  const milestones: { match: (t: string) => boolean; key: string; id: string }[] = [
    {
      id: "understood",
      match: (t) => t.includes("analysis") || t.includes("understanding"),
      key: "understood",
    },
    {
      id: "planning",
      match: (t) => t.includes("plan.created") || t.includes("architecture"),
      key: "planning",
    },
    { id: "identity", match: (t) => t.includes("identity"), key: "identity" },
    { id: "spec", match: (t) => t.includes("spec.updated"), key: "spec" },
    { id: "graph", match: (t) => t.includes("graph.updated"), key: "graph" },
    { id: "validation", match: (t) => t.includes("validation"), key: "validation" },
    {
      id: "tests-run",
      match: (t) => t.includes("test.started") || t.includes("tests.started"),
      key: "testsRun",
    },
    {
      id: "tests-ok",
      match: (t) => t.includes("test.completed") || t.includes("tests.passed"),
      key: "testsOk",
    },
    { id: "tests-fail", match: (t) => t.includes("tests.failed"), key: "testsFail" },
    { id: "repair", match: (t) => t.includes("repair"), key: "repair" },
    { id: "sandbox", match: (t) => t.includes("sandbox"), key: "sandbox" },
    {
      id: "scaffold",
      match: (t) => t.includes("scaffolding") || t.includes("project.scaffolding"),
      key: "scaffold",
    },
    { id: "snapshot", match: (t) => t.includes("snapshot"), key: "snapshot" },
    {
      id: "thinking",
      match: (t) =>
        t.includes("model.call") || t.includes("builder.model") || t.includes("builder.chat"),
      key: "thinking",
    },
  ];

  const mutationIds = new Set([
    "planning",
    "identity",
    "spec",
    "graph",
    "validation",
    "tests-run",
    "tests-ok",
    "tests-fail",
    "repair",
    "sandbox",
    "scaffold",
    "snapshot",
  ]);

  for (const m of milestones) {
    if (readOnly && mutationIds.has(m.id)) continue;
    const matching = events.filter((e) => m.match(e.eventType));
    if (matching.length > 0) {
      push({ id: m.id, key: m.key }, firstSequence(matching));
    }
  }

  if (lines.length === 0) {
    push({ id: "boot", key: readOnly ? "thinking" : "planning", active: true }, 0);
    return { lines };
  }

  // Chronological, and never truncated: a line must not vanish once shown.
  const ordered = [...lines]
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...spec }) => spec);
  const last = ordered[ordered.length - 1];
  if (last) last.active = true;
  return { lines: ordered };
}
