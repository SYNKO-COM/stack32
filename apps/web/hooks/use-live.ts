"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { LiveThread } from "@/lib/domain/types";
import { getLiveRepository } from "@/lib/repositories/factory";

/** True while the (mock) agent is still working on the latest reply. */
function isThreadActive(thread: LiveThread | undefined): boolean {
  if (!thread) return false;
  const last = thread.messages[thread.messages.length - 1];
  if (!last) return false;
  return last.role === "user" || last.pending === true;
}

export function useLiveThread(agentId: string) {
  return useQuery({
    queryKey: ["live", agentId],
    queryFn: () => getLiveRepository().getThread(agentId),
    enabled: Boolean(agentId),
    // Poll while a (mock) run is in flight so persisted status updates stream
    // into the UI. Realtime channels can replace this in Phase 3.
    refetchInterval: (query) => (isThreadActive(query.state.data) ? 700 : false),
  });
}

export function useSendLiveMessage(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => getLiveRepository().sendMessage(agentId, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["live", agentId] }),
  });
}

export function useClearLiveThread(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getLiveRepository().clearThread(agentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["live", agentId] }),
  });
}
