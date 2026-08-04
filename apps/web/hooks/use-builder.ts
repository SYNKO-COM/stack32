"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { BuilderThread } from "@/lib/domain/types";
import { getBuilderRepository } from "@/lib/repositories/factory";

/** True while the (mock) builder is still producing progressive updates. */
function isThreadActive(thread: BuilderThread | undefined): boolean {
  if (!thread) return false;
  const last = thread.messages[thread.messages.length - 1];
  if (!last) return false;
  if (last.role === "user") return true;
  // Steps may all be "done" while the final content is still being written.
  if (last.content === "") return true;
  return Boolean(last.steps?.some((s) => s.state === "running" || s.state === "pending"));
}

export function useBuilderThread(agentId: string) {
  return useQuery({
    queryKey: ["builder", agentId],
    queryFn: () => getBuilderRepository().getThread(agentId),
    enabled: Boolean(agentId),
    // Poll while a (mock) build is in flight so persisted step updates stream
    // into the UI. Realtime channels can replace this in Phase 3.
    refetchInterval: (query) => (isThreadActive(query.state.data) ? 700 : false),
  });
}

export function useSendBuilderMessage(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => getBuilderRepository().sendMessage(agentId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["builder", agentId] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export function useRepairAgent(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getBuilderRepository().repairAgent(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["builder", agentId] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}
