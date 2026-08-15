"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ComposerAttachment } from "@/components/shared/prompt-composer";
import type { LiveThread } from "@/lib/domain/types";
import { getLiveRepository } from "@/lib/repositories/factory";

/** True while the (mock) agent is still working on the latest reply. */
function isThreadActive(thread: LiveThread | undefined): boolean {
  if (!thread) return false;
  const last = thread.messages[thread.messages.length - 1];
  if (!last) return false;
  return last.role === "user" || last.pending === true;
}

export type SendLiveMessageInput = {
  content: string;
  attachments?: ComposerAttachment[];
};

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
    mutationFn: (input: string | SendLiveMessageInput) => {
      const content = typeof input === "string" ? input : input.content;
      const attachments = typeof input === "string" ? undefined : input.attachments;
      return getLiveRepository().sendMessage(agentId, content, attachments);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["live", agentId] }),
  });
}

export function useClearLiveThread(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getLiveRepository().clearThread(agentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["live", agentId] });
      void queryClient.removeQueries({ queryKey: ["live-execution"] });
      void queryClient.removeQueries({ queryKey: ["active-live-run", agentId] });
    },
  });
}

export function useCancelLiveRun(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (runId?: string | null) => {
      const { cancelLiveRun } = await import("@/lib/actions/live");
      return cancelLiveRun({ agentId, runId });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["live", agentId] });
      void queryClient.invalidateQueries({ queryKey: ["live-execution"] });
    },
  });
}
