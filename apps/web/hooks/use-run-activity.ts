"use client";

import { useQuery } from "@tanstack/react-query";

import { requireSupabaseBrowserClient } from "@/lib/supabase/client";

export type RunActivityEvent = {
  eventType: string;
  sequence: number;
  path?: string;
  /** Coding tool that produced the event, e.g. "workspace.read_file". */
  tool?: string;
  /** False when the tool call was refused or errored. */
  ok?: boolean;
  /** Shell command for exec events, already joined for display. */
  command?: string;
  /** Search term for grep events. */
  query?: string;
  mappingKey?: string;
  createdAt?: string;
};

export type ActivityLineSpec = {
  id: string;
  /** i18n key under builder:activity.* */
  key: string;
  /** Key before pluralisation — used to merge consecutive identical beats. */
  baseKey?: string;
  kind?: ActivityKind;
  count?: number;
  sequence?: number;
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
        // Tool events carry their target inside `args`, not at the top level:
        // builder.file.read is {tool, args:{path}} while builder.file.created is
        // {path}. Reading only the top level left every file the coding agent
        // opened showing as a nameless "Reading …".
        const args =
          payload.args && typeof payload.args === "object" && !Array.isArray(payload.args)
            ? (payload.args as Record<string, unknown>)
            : {};
        const rawCommand = args.command;
        const command = Array.isArray(rawCommand)
          ? rawCommand.map(String).join(" ")
          : typeof rawCommand === "string"
            ? rawCommand
            : undefined;
        return {
          eventType: String(row.event_type ?? ""),
          sequence: Number(row.sequence ?? 0),
          path:
            typeof payload.path === "string"
              ? payload.path
              : typeof args.path === "string"
                ? args.path
                : undefined,
          tool: typeof payload.tool === "string" ? payload.tool : undefined,
          // Tool events now carry their outcome. A refused write must not be
          // announced as an edit that happened.
          ok: payload.ok === false ? false : undefined,
          command,
          query: typeof args.query === "string" ? args.query : undefined,
          mappingKey:
            typeof payload.mapping_key === "string" ? payload.mapping_key : undefined,
          createdAt: row.created_at ?? undefined,
        };
      });
    },
  });
}


function shortCommand(command?: string): string | undefined {
  if (!command) return undefined;
  const trimmed = command.trim();
  // `bash -c "..."` is how the agent runs most things; show the inner command.
  const inner = trimmed.match(/^(?:bash|sh)\s+-c\s+["']?(.+?)["']?$/s);
  const effective = (inner?.[1] ?? trimmed).trim();
  const head = effective.split(/\s+/).slice(0, 3).join(" ");
  return head.length > 42 ? `${head.slice(0, 42)}…` : head;
}

function shortPath(path?: string): string {
  if (!path) return "";
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export type ActivityKind = "read" | "write" | "exec" | "think" | "milestone" | "error";

type Mapping = { kind: ActivityKind; key: string; usesPath?: boolean };

/**
 * One event type → one timeline step. Order matters: the first match wins, so
 * the specific patterns sit above the generic ones.
 */
const EVENT_MAP: [(t: string) => boolean, Mapping][] = [
  [(t) => t.includes("file.read"), { kind: "read", key: "readOne", usesPath: true }],
  [(t) => t.includes("file.created") || t.includes("file.write"), { kind: "write", key: "wroteOne", usesPath: true }],
  [(t) => t.includes("file.patch"), { kind: "write", key: "patchedOne", usesPath: true }],
  [(t) => t.includes("context.indexing"), { kind: "think", key: "indexed" }],
  [(t) => t.includes("context.search"), { kind: "read", key: "searching" }],
  [(t) => t.includes("tests.started") || t.includes("test.started"), { kind: "exec", key: "testsRun" }],
  [(t) => t.includes("tests.passed") || t.includes("test.completed"), { kind: "milestone", key: "testsOk" }],
  [(t) => t.includes("tests.failed"), { kind: "error", key: "testsFail" }],
  [(t) => t.includes("repair.rejected"), { kind: "error", key: "repairRejected" }],
  [(t) => t.includes("repair.exhausted"), { kind: "error", key: "repairExhausted" }],
  [(t) => t.includes("repair"), { kind: "exec", key: "repair" }],
  [(t) => t.includes("command.completed"), { kind: "exec", key: "ranCommand" }],
  [(t) => t.includes("security.check"), { kind: "exec", key: "securityCheck" }],
  [(t) => t.includes("model.escalated"), { kind: "think", key: "escalated" }],
  [(t) => t.includes("model.call"), { kind: "think", key: "thinking" }],
  [(t) => t.includes("sandbox"), { kind: "milestone", key: "sandbox" }],
  [(t) => t.includes("scaffolding"), { kind: "milestone", key: "scaffold" }],
  [(t) => t.includes("plan.created") || t.includes("architecture"), { kind: "milestone", key: "planning" }],
  [(t) => t.includes("analysis") || t.includes("understanding"), { kind: "milestone", key: "understood" }],
  [(t) => t.includes("identity"), { kind: "milestone", key: "identity" }],
  [(t) => t.includes("spec.updated"), { kind: "milestone", key: "spec" }],
  [(t) => t.includes("graph.updated"), { kind: "milestone", key: "graph" }],
  [(t) => t.includes("validation"), { kind: "milestone", key: "validation" }],
  [(t) => t.includes("snapshot"), { kind: "milestone", key: "snapshot" }],
  [(t) => t.includes("ready"), { kind: "milestone", key: "ready" }],
];

/** Events that only describe a mutation — hidden when viewing someone else's run. */
const MUTATION_KEYS = new Set([
  "wroteOne", "patchedOne", "testsRun", "testsOk", "testsFail", "repair",
  "repairRejected", "repairExhausted", "ranCommand", "sandbox", "scaffold",
  "planning", "identity", "spec", "graph", "validation", "snapshot", "ready",
]);

function classify(eventType: string): Mapping | null {
  for (const [match, mapping] of EVENT_MAP) {
    if (match(eventType)) return mapping;
  }
  return null;
}

/**
 * Turn raw run events into a chronological timeline of what the agent did.
 *
 * The previous version collapsed every event into ~20 fixed aggregate lines
 * ("read 5 files") and kept them all on screen, which read as a static stacked
 * checklist rather than an agent working. Steps are now emitted in order, and
 * consecutive events of the same kind merge into one step with a count so a
 * hundred file reads stay one line without losing the sequence.
 */
export function summarizeActivity(
  events: RunActivityEvent[],
  opts?: { readOnly?: boolean },
): { lines: ActivityLineSpec[] } {
  const readOnly = Boolean(opts?.readOnly);
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  const steps: ActivityLineSpec[] = [];

  for (const event of ordered) {
    const mapping = classify(event.eventType);
    if (!mapping) continue;
    // Never narrate something the agent tried and failed to do.
    if (event.ok === false) continue;
    if (readOnly && MUTATION_KEYS.has(mapping.key)) continue;

    const path = mapping.usesPath ? shortPath(event.path) : undefined;
    // Name what the agent is actually doing: the binary it ran, the term it
    // searched for. "Ran a command" tells the user nothing; "Ran pytest" does.
    const detail =
      mapping.key === "ranCommand"
        ? shortCommand(event.command)
        : mapping.key === "searching"
          ? event.query
          : undefined;
    const previous = steps[steps.length - 1];

    // Merge a repeat of the same beat instead of stacking near-identical lines.
    if (previous && previous.kind === mapping.kind && previous.baseKey === mapping.key) {
      const count = (previous.count ?? 1) + 1;
      previous.count = count;
      previous.key = mapping.usesPath ? `${mapping.key}Plus` : mapping.key;
      previous.params = mapping.usesPath
        ? { path: path || previous.params?.path || "…", count: count - 1 }
        : { count };
      previous.sequence = event.sequence;
      continue;
    }

    steps.push({
      id: `${mapping.key}-${event.sequence}`,
      key: detail ? `${mapping.key}Detail` : mapping.key,
      baseKey: mapping.key,
      kind: mapping.kind,
      count: 1,
      sequence: event.sequence,
      params: path ? { path: path || "…" } : detail ? { detail } : undefined,
    });
  }

  if (steps.length === 0) {
    return {
      lines: [
        {
          id: "boot",
          key: readOnly ? "thinking" : "planning",
          baseKey: readOnly ? "thinking" : "planning",
          kind: "think",
          sequence: 0,
          active: true,
        },
      ],
    };
  }

  const last = steps[steps.length - 1];
  if (last) last.active = true;
  return { lines: steps };
}
