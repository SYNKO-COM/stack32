"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Subscribe to agent-service SSE for a run. Falls back silently — poll remains primary.
 * Uses fetch streaming because EventSource cannot set Authorization headers.
 */
export function useRunEventStream(opts: {
  agentId: string;
  runId: string | null | undefined;
  enabled?: boolean;
  accessToken?: string | null;
}) {
  const queryClient = useQueryClient();
  const lastSeq = useRef(0);

  useEffect(() => {
    if (!opts.enabled || !opts.runId || !opts.accessToken) return;
    const controller = new AbortController();
    const base =
      process.env.NEXT_PUBLIC_AGENT_SERVICE_URL?.replace(/\/$/, "") ||
      "http://localhost:8000";
    const url = `${base}/v1/runs/${opts.runId}/stream?last_event_id=${lastSeq.current}`;

    void (async () => {
      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${opts.accessToken}`,
            Accept: "text/event-stream",
          },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            try {
              const payload = JSON.parse(dataLine.slice(6)) as {
                type?: string;
                sequence?: number;
              };
              if (typeof payload.sequence === "number") {
                lastSeq.current = Math.max(lastSeq.current, payload.sequence);
              }
              await queryClient.invalidateQueries({
                queryKey: ["live-execution", opts.runId],
              });
              if (payload.type === "stream.end") {
                await queryClient.invalidateQueries({ queryKey: ["builder", opts.agentId] });
                return;
              }
              await queryClient.invalidateQueries({ queryKey: ["builder", opts.agentId] });
            } catch {
              // ignore malformed SSE frames
            }
          }
        }
      } catch {
        // Network/abort — poll fallback handles freshness.
      }
    })();

    return () => controller.abort();
  }, [opts.agentId, opts.runId, opts.enabled, opts.accessToken, queryClient]);
}
