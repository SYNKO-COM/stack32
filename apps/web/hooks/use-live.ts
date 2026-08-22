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
    refetchOnWindowFocus: false,
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
    onMutate: async (input) => {
      const content = typeof input === "string" ? input : input.content;
      const attachments = typeof input === "string" ? undefined : input.attachments;
      await queryClient.cancelQueries({ queryKey: ["live", agentId] });
      const previous = queryClient.getQueryData<LiveThread>(["live", agentId]);
      if (previous) {
        const optimisticId = `optimistic-${Date.now()}`;
        const optimisticAttachments = attachments?.length
          ? attachments.map((a) => ({
              id: a.id,
              name: a.name,
              mimeType: a.mimeType,
              kind: a.kind,
              url: a.previewUrl,
              sizeBytes: a.size,
            }))
          : undefined;
        queryClient.setQueryData<LiveThread>(["live", agentId], {
          ...previous,
          messages: [
            ...previous.messages,
            {
              id: optimisticId,
              threadId: previous.id,
              role: "user",
              content,
              attachments: optimisticAttachments,
              createdAt: new Date().toISOString(),
            },
          ],
        });
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
      // Drop optimistic bubble unless the limit gate already persisted the turn.
      const persisted =
        error &&
        typeof error === "object" &&
        "persisted" in error &&
        Boolean((error as { persisted?: boolean }).persisted);
      if (!persisted && context?.previous) {
        queryClient.setQueryData(["live", agentId], context.previous);
      }
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
    onMutate: async (runId) => {
      await queryClient.cancelQueries({ queryKey: ["live", agentId] });
      await queryClient.cancelQueries({ queryKey: ["active-live-run", agentId] });
      queryClient.setQueryData(["active-live-run", agentId], null);
      const previous = queryClient.getQueryData<LiveThread>(["live", agentId]);
      if (previous) {
        const patched = previous.messages.map((m) => {
          if (!m.pending) return m;
          if (runId && m.runId && m.runId !== runId) return m;
          return {
            ...m,
            pending: false,
            content: "live:errors.canceled",
            tone: "warning" as const,
          };
        });
        queryClient.setQueryData<LiveThread>(["live", agentId], {
          ...previous,
          messages: patched,
        });
      }
      if (runId) {
        queryClient.setQueryData(["live-execution", runId], {
          runStatus: "idle",
          nodes: {},
          edges: {},
          legacy: {},
          error: null,
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(["live", agentId], ctx.previous);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["live", agentId] });
      void queryClient.invalidateQueries({ queryKey: ["live-execution"] });
      void queryClient.invalidateQueries({ queryKey: ["active-live-run", agentId] });
    },
  });
}
