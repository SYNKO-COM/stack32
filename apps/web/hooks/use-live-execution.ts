"use client";

import { useQuery } from "@tanstack/react-query";

import { requireSupabaseBrowserClient } from "@/lib/supabase/client";

export type ModuleExecState =
  | "idle"
  | "queued"
  | "running"
  | "success"
  | "error"
  | "waiting_for_approval"
  | "waiting_for_connection";

export type LiveExecutionMap = Record<string, ModuleExecState>;

type LiveEvent = {
  eventType: string;
  toolId?: string;
  provider?: string;
  appId?: string;
};

/**
 * Map Live run_events → Structure module execution states.
 * Keys are module ids (tool_id for tools, or semantic ids: input/brain/model/output).
 */
export function useLiveExecutionState(runId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["live-execution", runId],
    enabled: Boolean(runId) && enabled,
    refetchInterval: enabled ? 800 : false,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<LiveExecutionMap> => {
      if (!runId) return {};
      const supabase = requireSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("run_events")
        .select("event_type, payload, sequence")
        .eq("run_id", runId)
        .order("sequence", { ascending: true })
        .limit(120);
      if (error) throw error;
      const events: LiveEvent[] = (data ?? []).map((row) => {
        const payload =
          row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : {};
        return {
          eventType: String(row.event_type ?? ""),
          toolId: typeof payload.tool_id === "string" ? payload.tool_id : undefined,
          provider: typeof payload.provider === "string" ? payload.provider : undefined,
          appId: typeof payload.app_id === "string" ? payload.app_id : undefined,
        };
      });
      return reduceExecutionState(events);
    },
  });
}

export function reduceExecutionState(events: LiveEvent[]): LiveExecutionMap {
  const state: LiveExecutionMap = {
    input: "idle",
    brain: "idle",
    model: "idle",
    output: "idle",
  };

  for (const event of events) {
    const t = event.eventType;
    if (t.includes("runtime.input.received")) {
      state.input = "success";
      state.brain = "running";
    }
    if (t.includes("runtime.model.started")) {
      state.model = "running";
      state.brain = "running";
    }
    if (t.includes("runtime.model.completed")) {
      state.model = "success";
    }
    if (t.includes("runtime.output.completed")) {
      state.brain = "success";
      state.output = "success";
    }
    if (t.includes("runtime.tool.started") && event.toolId) {
      state[event.toolId] = "running";
      state.brain = "running";
    }
    if (t.includes("runtime.tool.completed") && event.toolId) {
      state[event.toolId] = "success";
    }
    if (t.includes("runtime.tool.failed") && event.toolId) {
      state[event.toolId] = "error";
    }
    if (t.includes("runtime.connection.required") && event.toolId) {
      state[event.toolId] = "waiting_for_connection";
    }
    if (t.includes("runtime.approval.requested") && event.toolId) {
      state[event.toolId] = "waiting_for_approval";
    }
  }
  return state;
}
