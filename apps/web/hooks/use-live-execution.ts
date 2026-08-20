"use client";

import { useQuery } from "@tanstack/react-query";

import {
  reduceExecutionEvents,
  reduceExecutionState,
  type ExecutionVisualState,
} from "@/lib/domain/execution-state";
import type { ProductAgentGraph } from "@/lib/domain/product-agent-graph";
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

export type { ExecutionVisualState };

type LiveEvent = {
  eventType: string;
  toolId?: string;
  provider?: string;
  appId?: string;
  code?: string;
  errorType?: string;
  error?: string;
  mappingKey?: string;
  sequence?: number;
  rawPayload?: Record<string, unknown>;
};

/**
 * Map Live run_events → Structure module execution states.
 * Keys are module ids (tool_id for tools, or semantic ids: input/brain/model/output).
 */
export function useLiveExecutionState(
  runId: string | null | undefined,
  enabled: boolean,
  graph?: ProductAgentGraph | null,
) {
  return useQuery({
    queryKey: ["live-execution", runId],
    enabled: Boolean(runId) && enabled,
    placeholderData: enabled ? (previous) => previous : undefined,
    refetchInterval: enabled ? 2200 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    staleTime: 1500,
    notifyOnChangeProps: ["data", "error"],
    queryFn: async (): Promise<ExecutionVisualState> => {
      if (!runId) {
        return { runStatus: "idle", nodes: {}, edges: {}, legacy: {}, error: null };
      }
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
          code: typeof payload.code === "string" ? payload.code : undefined,
          errorType:
            typeof payload.error_type === "string"
              ? payload.error_type
              : typeof payload.errorType === "string"
                ? payload.errorType
                : undefined,
          error:
            typeof payload.error === "string"
              ? payload.error
              : typeof payload.message === "string"
                ? payload.message
                : undefined,
          mappingKey:
            typeof payload.mapping_key === "string" ? payload.mapping_key : undefined,
          sequence: typeof row.sequence === "number" ? row.sequence : undefined,
          rawPayload: payload,
        };
      });
      return reduceExecutionEvents(events, graph ?? null);
    },
  });
}

export { reduceExecutionState, reduceExecutionEvents };
