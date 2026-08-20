"use client";

import { ExternalLink, AlertTriangle, Loader2, Table2, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { AgentIcon } from "@/components/builder/agent-icon";
import { IntegrationConnectionCard } from "@/components/builder/integration-connection-card";
import { LiveApprovalCard } from "@/components/builder/live-approval-card";
import { SecretForm } from "@/components/builder/secret-form";
import { Markdown } from "@/components/shared/markdown";
import { MessageAttachmentPreviews } from "@/components/shared/message-attachment-previews";
import { PromptComposer } from "@/components/shared/prompt-composer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAgent, useAgentSpec } from "@/hooks/use-agents";
import { useCurrentUser } from "@/hooks/use-auth";
import { useClearLiveThread, useCancelLiveRun, useLiveThread, useSendLiveMessage } from "@/hooks/use-live";
import { useTranslation } from "@/hooks/use-translation";
import { stripAttachedPlaceholders } from "@/lib/chat/message-attachments";
import { CopySupportLogsButton } from "@/components/shared/copy-support-logs-button";
import { gatherSupportDiagnostic } from "@/lib/actions/support-diagnostic";
import { isFailureMessageKey, isStaleInflightMessage } from "@/lib/chat/backend-failure";
import { isUpgradeGateError, PlanLimitError } from "@/lib/billing/plan-limit";
import type { LiveMessage } from "@/lib/domain/types";
import { useUiStore } from "@/store/ui-store";
import { cn } from "@/lib/utils";

function LiveBubble({
  message,
  agentId,
  agentIcon,
  userPrompt,
  onSecretSubmitted,
}: {
  message: LiveMessage;
  agentId: string;
  agentIcon: string;
  userPrompt?: string;
  onSecretSubmitted?: () => void;
}) {
  const { t, i18n } = useTranslation(["live", "builder", "errors", "common"]);
  const { data: user } = useCurrentUser();
  const isUser = message.role === "user";

  const time = new Intl.DateTimeFormat(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(message.createdAt));

  if (message.pending) {
    const statusLabel = message.statusKey
      ? t(`status.${message.statusKey}`, { defaultValue: t("status.preparing") })
      : t("status.preparing");
    return (
      <div className="flex gap-3">
        <AgentIcon icon={agentIcon} className="mt-1 size-7 rounded-full" />
        <div
          className="glass flex items-center gap-2.5 rounded-3xl px-4 py-3 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-4 animate-spin text-brand" aria-hidden="true" />
          {statusLabel}
        </div>
      </div>
    );
  }

  const isBackendFailure =
    isFailureMessageKey(message.content) ||
    message.tone === "warning" ||
    message.tone === "error";

  const raw =
    message.content.startsWith("live:") || message.content.startsWith("builder:")
      ? t(message.content)
      : stripAttachedPlaceholders(message.content);
  const hasBody =
    Boolean(raw.trim()) ||
    Boolean(message.uiComponent) ||
    Boolean(message.artifacts?.length) ||
    Boolean(message.citations?.length) ||
    isBackendFailure;

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      {isUser ? (
        <Avatar className="mt-1 size-7 shrink-0">
          {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
          <AvatarFallback className="bg-brand/30 text-xs">
            {(user?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      ) : (
        <AgentIcon icon={agentIcon} className="mt-1 size-7 rounded-full" />
      )}

      <div className={cn("min-w-0 max-w-[85%] sm:max-w-[75%]", isUser && "text-right")}>
        <p className="mb-1 font-mono text-[11px] text-muted-foreground/60">{time}</p>
        {isUser ? (
          <MessageAttachmentPreviews attachments={message.attachments} align="right" />
        ) : null}
        {hasBody ? (
        <div
          className={cn(
            "min-w-0 overflow-hidden rounded-3xl px-4 py-3 text-left text-sm leading-relaxed",
            isUser ? "bg-brand/15" : "glass",
            isBackendFailure && !isUser && "text-amber-800 dark:text-amber-200",
          )}
        >
          {isBackendFailure && !isUser ? (
            <div className="mb-2 space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                <AlertTriangle className="size-3.5" aria-hidden="true" />
                {t("common:status.needsAttention")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <CopySupportLogsButton
                  onCopy={() =>
                    gatherSupportDiagnostic({
                      agentId,
                      surface: "live",
                      messageId: message.id,
                      threadId: message.threadId,
                      runId: message.runId,
                      errorKey: message.content.startsWith("live:")
                        ? message.content
                        : undefined,
                      errorSummary: raw,
                      userPrompt,
                      pageUrl: typeof window !== "undefined" ? window.location.href : undefined,
                      locale: i18n.language,
                      userAgent:
                        typeof navigator !== "undefined" ? navigator.userAgent : undefined,
                    })
                  }
                />
                <span className="text-[11px] text-muted-foreground">
                  {t("common:support.copyHint")}
                </span>
              </div>
            </div>
          ) : null}
          {raw.trim() ? <Markdown content={raw} /> : null}

          {message.uiComponent?.type === "secret_form" ? (
            <SecretForm
              uiComponent={message.uiComponent}
              agentId={agentId}
              onSubmitted={onSecretSubmitted}
            />
          ) : null}

          {message.uiComponent?.type === "connection_form" ? (
            <div className="mt-3">
              <IntegrationConnectionCard
                agentId={agentId}
                provider={
                  message.uiComponent.fields.find((f) => f.key === "provider")?.suggested_value ||
                  "google"
                }
                appId={
                  message.uiComponent.fields.find((f) => f.key === "app_id" || f.key === "appId")
                    ?.suggested_value
                }
                toolIds={message.uiComponent.fields
                  .filter((f) => f.key === "tool_id" || f.key === "toolId" || f.key === "tool_ids")
                  .map((f) => f.suggested_value)
                  .filter((v): v is string => Boolean(v))}
                status="needs_setup"
                onConnected={onSecretSubmitted}
              />
            </div>
          ) : null}

          {message.uiComponent?.type === "approval_form" ? (
            <LiveApprovalCard
              agentId={agentId}
              uiComponent={message.uiComponent}
              onDecided={onSecretSubmitted}
            />
          ) : null}

          {message.artifacts && message.artifacts.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {message.artifacts.map((artifact) => (
                <span
                  key={artifact.title}
                  className="glass inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-foreground/80"
                >
                  <Table2 className="size-3.5 text-brand" aria-hidden="true" />
                  {t(`artifact.${artifact.kind}`)} · {artifact.title}
                </span>
              ))}
            </div>
          ) : null}

          {message.citations && message.citations.length > 0 ? (
            <div className="mt-3">
              <p className="mb-1.5 font-mono text-[11px] tracking-wide text-muted-foreground/60 uppercase">
                {t("citations.title")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {message.citations.map((citation) => (
                  <a
                    key={citation.url + citation.label}
                    href={citation.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-foreground/[0.04] px-2.5 py-1 text-xs text-foreground/70 hover:text-foreground"
                  >
                    <ExternalLink className="size-3" aria-hidden="true" />
                    {citation.label}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        ) : null}
      </div>
    </div>
  );
}

function promptBeforeLiveMessage(messages: LiveMessage[], messageId: string): string | undefined {
  const idx = messages.findIndex((m) => m.id === messageId);
  if (idx <= 0) return undefined;
  for (let i = idx - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role === "user" && m.content.trim()) return m.content.trim();
  }
  return undefined;
}

export function LiveView({
  agentId,
  activeRunId,
  headerActions,
  hideStatusBadge = false,
}: {
  agentId: string;
  /** Latest live run id from the parent (structure animation + stop). */
  activeRunId?: string | null;
  /** Extra controls in the header row (e.g. mobile modules sheet). */
  headerActions?: React.ReactNode;
  /** Public consumer usage — no draft/published badge. */
  hideStatusBadge?: boolean;
}) {
  const { t } = useTranslation(["live", "builder"]);
  const queryClient = useQueryClient();
  const openDialog = useUiStore((s) => s.openDialog);
  const { data: agent } = useAgent(agentId);
  const { data: spec } = useAgentSpec(agentId);
  const { data: thread } = useLiveThread(agentId);
  const sendMessage = useSendLiveMessage(agentId);
  const clearThread = useClearLiveThread(agentId);
  const cancelRun = useCancelLiveRun(agentId);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = thread?.messages ?? [];
  const pendingBusy = messages.some((m) => m.pending);
  const awaitingApproval = messages.some(
    (m) => m.role === "assistant" && m.uiComponent?.type === "approval_form",
  );
  const lastLiveMessage = messages.at(-1);
  const awaitingReply =
    lastLiveMessage?.role === "user" &&
    !isStaleInflightMessage(lastLiveMessage.createdAt);
  const busy =
    pendingBusy ||
    awaitingReply ||
    awaitingApproval ||
    sendMessage.isPending ||
    cancelRun.isPending;
  const runId =
    activeRunId ||
    [...messages].reverse().find((m) => m.runId)?.runId ||
    null;
  const agentName = agent?.name || t("builder:sidebar.untitledAgent");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
          {agent ? <AgentIcon icon={agent.icon} /> : null}
          <h1 className="truncate text-sm font-medium">{agentName}</h1>
          {!hideStatusBadge ? (
            <Badge
              variant="outline"
              className={cn(
                "hidden border-border text-xs sm:inline-flex",
                agent?.status === "published" ? "text-sky-300" : "text-zinc-300",
              )}
            >
              {agent?.status === "published" ? t("live:badge.published") : t("live:badge.draft")}
            </Badge>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {headerActions}
          {messages.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 px-2 text-muted-foreground sm:px-3"
              onClick={() => void clearThread.mutateAsync()}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">{t("live:actions.clear")}</span>
            </Button>
          ) : null}
        </div>
      </div>

      <div
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4"
        role="log"
        aria-label={t("live:a11y.conversation")}
        aria-live="polite"
      >
        <div className="mx-auto max-w-3xl space-y-6 py-8">
          {messages.length === 0 ? (
            <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
              {agent ? (
                <AgentIcon icon={agent.icon} className="mb-6 size-14 rounded-3xl" />
              ) : null}
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl md:text-3xl">
                {t("live:empty.title", { name: agentName })}
              </h2>
              <p className="mt-3 max-w-md text-sm text-muted-foreground">
                {t("live:empty.subtitle")}
              </p>
              {spec && spec.starterPrompts.length > 0 ? (
                <>
                  <p className="mt-8 font-mono text-[11px] tracking-[0.18em] text-muted-foreground/60 uppercase">
                    {t("live:starters.title")}
                  </p>
                  <div className="mt-3 flex max-w-lg flex-wrap justify-center gap-2">
                    {spec.starterPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        className="glass rounded-full px-4 py-2 text-sm text-foreground/80 transition-colors hover:bg-foreground/[0.04]"
                        onClick={() => void sendMessage.mutateAsync(prompt)}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            messages.map((message) => (
              <LiveBubble
                key={message.id}
                message={message}
                agentId={agentId}
                userPrompt={promptBeforeLiveMessage(messages, message.id)}
                agentIcon={agent?.icon ?? "bot"}
                onSecretSubmitted={() => {
                  void queryClient.invalidateQueries({ queryKey: ["live", agentId] });
                  void queryClient.invalidateQueries({ queryKey: ["live-execution"] });
                  void queryClient.invalidateQueries({ queryKey: ["active-live-run", agentId] });
                }}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 px-3 pb-4 sm:px-4 sm:pb-5">
        <PromptComposer
          className="mx-auto max-w-3xl"
          placeholder={t("live:composer.placeholder")}
          draftKey={`live:${agentId}`}
          onSubmit={async (value, attachments) => {
            if (busy) return false;
            try {
              await sendMessage.mutateAsync({ content: value, attachments });
            } catch (error) {
              if (isUpgradeGateError(error)) {
                openDialog("upgrade");
                // Persisted tipping message stays in the thread — clear the draft.
                if (error instanceof PlanLimitError && error.persisted) return;
                return false;
              }
              throw error;
            }
          }}
          onStop={() => {
            void cancelRun.mutateAsync(runId);
          }}
          busy={busy && !awaitingApproval}
          paused={awaitingApproval}
          disabled={busy && !runId && !pendingBusy}
        />
      </div>
    </div>
  );
}
