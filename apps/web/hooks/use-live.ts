"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ComposerAttachment } from "@/components/shared/prompt-composer";
import type { LiveThread } from "@/lib/domain/types";
import { isFailureMessageKey, isStaleInflightMessage } from "@/lib/chat/backend-failure";
import { getLiveRepository } from "@/lib/repositories/factory";

/** True while a live run is still in flight. */
function isThreadActive(thread: LiveThread | undefined): boolean {
  if (!thread) return false;
  const last = thread.messages[thread.messages.length - 1];
  if (!last) return false;
  if (last.pending) return true;
  if (isFailureMessageKey(last.content) || last.tone === "warning" || last.tone === "error") {
    return false;
  }
  if (last.role === "user") {
    return !isStaleInflightMessage(last.createdAt);
  }
  return false;
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
    placeholderData: (previous) => previous,
    refetchInterval: (query) => (isThreadActive(query.state.data) ? 2200 : false),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: (query) => isThreadActive(query.state.data),
    staleTime: 12_000,
    notifyOnChangeProps: ["data", "error", "isPending"],
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
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ["live", agentId] });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["live", agentId] });
    },
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
