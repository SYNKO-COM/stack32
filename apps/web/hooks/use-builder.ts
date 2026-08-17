"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ComposerAttachment } from "@/components/shared/prompt-composer";
import type { BuilderMessage, BuilderThread, MessageAttachment } from "@/lib/domain/types";
import { isFailureMessageKey, isStaleInflightMessage } from "@/lib/chat/backend-failure";
import { cancelBuilderRun } from "@/lib/actions/builder";
import { getBuilderRepository } from "@/lib/repositories/factory";

export type SendBuilderMessageInput = {
  content: string;
  attachments?: ComposerAttachment[];
  mode?: "build" | "chat";
};

function composerToMessageAttachments(
  attachments: ComposerAttachment[] | undefined,
): MessageAttachment[] | undefined {
  if (!attachments?.length) return undefined;
  return attachments.map((a) => ({
    id: a.id,
    name: a.name,
    mimeType: a.mimeType,
    kind: a.kind,
    url: a.previewUrl,
    sizeBytes: a.size,
  }));
}

/** True while the builder is still producing progressive updates. */
function isThreadActive(thread: BuilderThread | undefined): boolean {
  if (!thread) return false;
  const last = thread.messages[thread.messages.length - 1];
  if (!last) return false;
  if (isFailureMessageKey(last.content) || last.tone === "warning" || last.tone === "error") {
    return false;
  }
  if (last.role === "user") {
    return !isStaleInflightMessage(last.createdAt);
  }
  if (last.card === "thinking") {
    if (isFailureMessageKey(last.content)) return false;
    if (isStaleInflightMessage(last.createdAt, { emptyContent: !last.content })) return false;
    return true;
  }
  // Steps may all be "done" while the final content is still being written.
  if (last.content === "") return true;
  if (last.card === "build_progress") {
    const metaDone = Boolean(
      last.steps?.every((s) => s.state === "done" || s.state === "failed") &&
        last.buildBoard?.nodes.every((n) => n.state === "done" || n.state === "failed"),
    );
    if (!metaDone) return true;
  }
  return Boolean(last.steps?.some((s) => s.state === "running" || s.state === "pending"));
}

export function useBuilderThread(agentId: string, opts?: { forcePoll?: boolean }) {
  return useQuery({
    queryKey: ["builder", agentId],
    queryFn: () => getBuilderRepository().getThread(agentId),
    enabled: Boolean(agentId),
    // Keep prior messages painted while a poll is in flight (avoids blank flashes).
    placeholderData: (previous) => previous,
    // Slower cadence = fewer layout jumps; still responsive for build progress.
    refetchInterval: (query) =>
      opts?.forcePoll || isThreadActive(query.state.data) ? 1600 : false,
    staleTime: 800,
  });
}

export function useSendBuilderMessage(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: string | SendBuilderMessageInput) => {
      const content = typeof input === "string" ? input : input.content;
      const attachments = typeof input === "string" ? undefined : input.attachments;
      const mode = typeof input === "string" ? undefined : input.mode;
      return getBuilderRepository().sendMessage(agentId, content, attachments, mode);
    },
    onMutate: async (input) => {
      const content = typeof input === "string" ? input : input.content;
      const attachments = typeof input === "string" ? undefined : input.attachments;
      await queryClient.cancelQueries({ queryKey: ["builder", agentId] });
      await queryClient.cancelQueries({ queryKey: ["agents", agentId] });
      const previous = queryClient.getQueryData<BuilderThread>(["builder", agentId]);
      if (previous) {
        const optimistic: BuilderMessage = {
          id: `optimistic-${Date.now()}`,
          threadId: previous.id,
          role: "user",
          content,
          attachments: composerToMessageAttachments(attachments),
          createdAt: new Date().toISOString(),
        };
        queryClient.setQueryData<BuilderThread>(["builder", agentId], {
          ...previous,
          messages: [...previous.messages, optimistic],
        });
      }
      const mode = typeof input === "string" ? "build" : (input.mode ?? "build");
      // Chat mode must not flip the agent into "building".
      if (mode === "build") {
        queryClient.setQueryData(["agents", agentId], (old: { status?: string } | undefined) =>
          old ? { ...old, status: "building" } : old,
        );
        queryClient.setQueryData(["agents"], (old: Array<{ id: string; status?: string }> | undefined) =>
          Array.isArray(old)
            ? old.map((a) => (a.id === agentId ? { ...a, status: "building" } : a))
            : old,
        );
      }
      return { previous };
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ["builder", agentId] });
      void queryClient.invalidateQueries({ queryKey: ["agents", agentId] });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["agents", agentId] });
    },
    onSuccess: () => {
      // Soft refresh — avoid wiping the agents list on every turn (sidebar flicker).
      void queryClient.invalidateQueries({ queryKey: ["builder", agentId] });
      void queryClient.invalidateQueries({ queryKey: ["agents", agentId] });
    },
  });
}

export function useCancelBuilderRun(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cancelBuilderRun({ agentId }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["builder", agentId] });
      const previous = queryClient.getQueryData<BuilderThread>(["builder", agentId]);
      if (previous) {
        const terminalSteps = (steps: BuilderMessage["steps"]) =>
          steps?.map((s) => ({
            ...s,
            state:
              s.state === "running" || s.state === "pending" ? ("failed" as const) : s.state,
          }));
        // Patch in-flight cards only — do NOT append an optimistic cancel bubble
        // (that caused appear → vanish → reappear when the real message arrived).
        const patched = previous.messages.map((m) => {
          if (m.card !== "thinking" && m.card !== "build_progress") return m;
          return {
            ...m,
            content: m.card === "build_progress" ? "builder:errors.canceled" : m.content,
            focus: "Stopped by user",
            steps: terminalSteps(m.steps),
          };
        });
        queryClient.setQueryData<BuilderThread>(["builder", agentId], {
          ...previous,
          messages: patched,
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(["builder", agentId], ctx.previous);
      }
    },
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
