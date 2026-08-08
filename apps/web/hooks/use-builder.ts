"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { BuilderMessage, BuilderThread } from "@/lib/domain/types";
import { cancelBuilderRun } from "@/lib/actions/builder";
import { getBuilderRepository } from "@/lib/repositories/factory";

/** True while the (mock) builder is still producing progressive updates. */
function isThreadActive(thread: BuilderThread | undefined): boolean {
  if (!thread) return false;
  const last = thread.messages[thread.messages.length - 1];
  if (!last) return false;
  if (last.role === "user") return true;
  if (last.card === "thinking") return true;
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
    // Poll while a build is in flight so persisted step updates stream into the UI.
    refetchInterval: (query) =>
      opts?.forcePoll || isThreadActive(query.state.data) ? 700 : false,
  });
}

export function useSendBuilderMessage(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => getBuilderRepository().sendMessage(agentId, content),
    onMutate: async (content) => {
      await queryClient.cancelQueries({ queryKey: ["builder", agentId] });
      await queryClient.cancelQueries({ queryKey: ["agents", agentId] });
      const previous = queryClient.getQueryData<BuilderThread>(["builder", agentId]);
      if (previous) {
        const optimistic: BuilderMessage = {
          id: `optimistic-${Date.now()}`,
          threadId: previous.id,
          role: "user",
          content,
          createdAt: new Date().toISOString(),
        };
        queryClient.setQueryData<BuilderThread>(["builder", agentId], {
          ...previous,
          messages: [...previous.messages, optimistic],
        });
      }
      queryClient.setQueryData(["agents", agentId], (old: { status?: string } | undefined) =>
        old ? { ...old, status: "building" } : old,
      );
      queryClient.setQueryData(["agents"], (old: Array<{ id: string; status?: string }> | undefined) =>
        Array.isArray(old)
          ? old.map((a) => (a.id === agentId ? { ...a, status: "building" } : a))
          : old,
      );
      return { previous };
    },
    onError: (_err, _content, ctx) => {
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
