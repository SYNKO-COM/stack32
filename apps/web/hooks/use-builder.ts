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
  // After a form, the last card is an ack ("Identity saved", "Settings saved").
  // Production then writes the next form or progress — keep polling until it appears
  // or the ack is stale. Without this, a refresh during that gap shows a fake loop.
  if (last.role === "assistant" && !last.uiComponent) {
    const content = last.content ?? "";
    const continuationAck =
      last.card === "identity_confirmed" ||
      content === "builder:capabilities.saved" ||
      content === "builder:identity.confirmed" ||
      content.startsWith("builder:identity.confirmed") ||
      content === "builder:secrets.saved" ||
      content === "builder:providers.saved";
    if (continuationAck && !isStaleInflightMessage(last.createdAt)) {
      return true;
    }
  }
  return Boolean(last.steps?.some((s) => s.state === "running" || s.state === "pending"));
}

export function useBuilderThread(agentId: string, opts?: { forcePoll?: boolean }) {
  return useQuery({
    queryKey: ["builder", agentId],
    queryFn: () => getBuilderRepository().getThread(agentId),
    enabled: Boolean(agentId),
    placeholderData: (previous) => previous,
    refetchInterval: (query) => {
      const data = query.state.data;
      const last = data?.messages[data.messages.length - 1];
      const active = Boolean(opts?.forcePoll) || isThreadActive(data);
      // #region agent log
      if (typeof window !== "undefined" && window.location.hostname === "localhost") {
        fetch('http://127.0.0.1:7857/ingest/1ac9df66-3a30-4b3a-a8c1-bbbdaf39db81',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'faa28e'},body:JSON.stringify({sessionId:'faa28e',hypothesisId:'E',location:'use-builder.ts:refetchInterval',message:'builder poll decision',data:{active,forcePoll:Boolean(opts?.forcePoll),lastRole:last?.role,lastCard:last?.card ?? null,lastContent:(last?.content ?? '').slice(0,80),hasUi:Boolean(last?.uiComponent),msgCount:data?.messages.length ?? 0},timestamp:Date.now()})}).catch(()=>{});
      }
      // #endregion
      return active ? 2800 : false;
    },
    // Keep polling after a form submit even if the user switches tabs — otherwise
    // production waits on Cloud Tasks / a slow identity resume with no client fetch.
    refetchIntervalInBackground: Boolean(opts?.forcePoll),
    refetchOnWindowFocus: (query) =>
      Boolean(opts?.forcePoll) || isThreadActive(query.state.data),
    staleTime: 12_000,
    notifyOnChangeProps: ["data", "error", "isPending"],
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
