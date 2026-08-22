"use client";

import { AlertTriangle, CircleX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AgentCapabilitiesForm } from "@/components/builder/agent-capabilities-form";
import { AgentIdentityForm } from "@/components/builder/agent-identity-form";
import { BuildProgressPanel } from "@/components/builder/build-progress-panel";
import { BuilderWorkingPanel } from "@/components/builder/builder-working-panel";
import { DynamicQuestionsForm } from "@/components/builder/dynamic-questions-form";
import { IntegrationConnectionCard } from "@/components/builder/integration-connection-card";
import { MessageEntrance, TypewriterText } from "@/components/builder/message-motion";
import { IdentityConfirmedMessage, ReadyCard } from "@/components/builder/ready-card";
import { SecretForm } from "@/components/builder/secret-form";
import { ToolReviewForm } from "@/components/builder/tool-review-form";
import { ToolSetupCard } from "@/components/builder/tool-setup-card";
import { LogoMark } from "@/components/shared/logo";
import { Markdown } from "@/components/shared/markdown";
import { MessageAttachmentPreviews } from "@/components/shared/message-attachment-previews";
import { PromptComposer } from "@/components/shared/prompt-composer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAgent } from "@/hooks/use-agents";
import { useCurrentUser } from "@/hooks/use-auth";
import {
  useBuilderThread,
  useCancelBuilderRun,
  useSendBuilderMessage,
  isThreadActive,
} from "@/hooks/use-builder";
import { summarizeActivity, useRunActivity } from "@/hooks/use-run-activity";
import { CopySupportLogsButton } from "@/components/shared/copy-support-logs-button";
import { gatherSupportDiagnostic } from "@/lib/actions/support-diagnostic";
import { isFailureMessageKey, isStaleInflightMessage } from "@/lib/chat/backend-failure";
import { isUpgradeGateError } from "@/lib/billing/plan-limit";
import { stripAttachedPlaceholders } from "@/lib/chat/message-attachments";
import { useTranslation } from "@/hooks/use-translation";
import { playAgentReadyChime } from "@/lib/audio/agent-ready-chime";
import type {
  BuilderInteractionMode,
  ComposerAttachment,
} from "@/components/shared/prompt-composer";
import type { BuilderAction, BuilderMessage } from "@/lib/domain/types";
import { consumePendingPrompt, consumePrefillPayload, takePrefillSending } from "@/lib/pending-prompt";
import {
  clearBuilderStop,
  readBuilderStop,
  writeBuilderStop,
} from "@/lib/builder/stop-persistence";
import {
  isTerminalAssistantMessage,
  turnHasTerminalReply,
} from "@/lib/builder/turn-terminal";
import { requireSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";
import type { BuilderOperation } from "@/components/builder/builder-working-panel";

/** Intermediate builder acks — must not clear the working UI or end the turn. */
function isEphemeralBuilderAck(message: BuilderMessage | undefined): boolean {
  if (!message || message.role !== "assistant") return false;
  if (
    message.card === "thinking" ||
    message.card === "build_progress" ||
    message.card === "identity_confirmed" ||
    message.card === "tools_confirmed"
  ) {
    return true;
  }
  // Locked/submitted form bubble still on screen while the next step starts.
  if (message.formResolved && !message.uiComponent) return true;
  if (message.uiComponent) return false;
  const content = message.content ?? "";
  if (!content.startsWith("builder:")) return false;
  return (
    content === "builder:capabilities.saved" ||
    content === "builder:capabilities.formClosed" ||
    content === "builder:identity.confirmed" ||
    content.startsWith("builder:identity.confirmed") ||
    content === "builder:identity.formClosed" ||
    content === "builder:secrets.saved" ||
    content === "builder:secrets.formClosed" ||
    content === "builder:providers.saved" ||
    content === "builder:toolReview.saved" ||
    content === "builder:questions.formClosed" ||
    content === "builder:connection.prompt" ||
    content === "builder:connection.required"
  );
}

function isWorkingCard(message: BuilderMessage | undefined): boolean {
  return message?.card === "thinking" || message?.card === "build_progress";
}

function humanizeProblemText(raw: string): string {
  const text = raw.trim();
  const lower = text.toLowerCase();
  if (
    lower.includes("agent connection binding") ||
    lower.includes("required agent connection")
  ) {
    return "Connect the required account so this agent can use its tools.";
  }
  if (lower.startsWith("missing connection:")) {
    const label = text.split(":").slice(1).join(":").trim() || "an app";
    return `Connect your ${label} account to continue.`;
  }
  if (lower.includes("unresolved tools")) {
    return text.replace(/Unresolved tools:/i, "Some tools still need to be set up:");
  }
  if (lower.includes("agentspec")) {
    return "The agent configuration needs a small fix.";
  }
  if (lower.includes("binding never") || lower.includes("approval policy")) {
    return "Some tools can make changes without asking you first — review approvals.";
  }
  if (lower.includes("incomplete setup:")) {
    const label = text.split(":").slice(1).join(":").trim() || "a tool";
    return `Finish setup for ${label}.`;
  }
  return text;
}

/** Connection/secret forms belong to AI Agent (installation), not Build. */
function isInstallationOnlyForm(ui: BuilderMessage["uiComponent"]): boolean {
  if (!ui) return false;
  if (ui.context !== "builder") return false;
  return ui.type === "connection_form" || ui.type === "secret_form";
}

function isCancelNoticeContent(content?: string | null): boolean {
  return (
    content === "builder:errors.canceledDetail" || content === "builder:errors.canceled"
  );
}

function MessageActions({
  actions,
  agentId,
  onFix,
  problems,
  fixResolved = false,
}: {
  actions: BuilderAction[];
  agentId: string;
  onFix: () => void;
  problems?: string[];
  fixResolved?: boolean;
}) {
  const { t } = useTranslation("builder");
  const router = useRouter();

  const primary = actions.filter((a) => a !== "view_structure" && a !== "view_changes");
  const fixActions = primary.filter((a) => a === "fix_automatically");
  const otherActions = primary.filter((a) => a !== "fix_automatically");

  if (primary.length === 0) return null;

  const problemList =
    problems && problems.length > 0
      ? problems.map(humanizeProblemText)
      : [t("actions.problemsDetectedFallback")];

  return (
    <div className="mt-4 space-y-3">
      {otherActions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {otherActions.map((action) => {
            if (action === "test_agent" || action === "open_ai_agent") {
              return (
                <Button
                  key={action}
                  size="sm"
                  className="rounded-full"
                  onClick={() => router.push(`/agents/${agentId}/agent`)}
                >
                  {action === "open_ai_agent"
                    ? t("actions.openAiAgent")
                    : t("actions.testAgent")}
                </Button>
              );
            }
            return null;
          })}
        </div>
      ) : null}

      {fixActions.map((action) => (
        <div
          key={action}
          className="rounded-2xl border border-border/50 bg-foreground/[0.03] px-4 py-3"
        >
          <p className="text-sm font-semibold text-foreground">
            {t("actions.problemsDetectedTitle")}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-foreground/85">
            {problemList.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
          <Button
            size="sm"
            className="mt-3 rounded-full bg-brand text-white hover:bg-brand/90 disabled:opacity-60"
            onClick={onFix}
            disabled={fixResolved}
          >
            {fixResolved ? t("actions.fixResolved") : t("actions.fixAutomatically")}
          </Button>
          {fixResolved ? null : (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t("actions.fixAutomaticallyHint")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function promptBeforeMessage(messages: BuilderMessage[], messageId: string): string | undefined {
  const idx = messages.findIndex((m) => m.id === messageId);
  if (idx <= 0) return undefined;
  for (let i = idx - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role === "user" && m.content.trim()) return m.content.trim();
  }
  return undefined;
}

function BuilderBubble({
  message,
  agentId,
  onFix,
  onFormSubmitted,
  resolvedFormIds,
  formSuperseded,
  fixResolved = false,
  isFresh,
  animateNow,
  onRevealDone,
  activityLines,
  userPrompt,
}: {
  message: BuilderMessage;
  agentId: string;
  onFix: () => void;
  onFormSubmitted?: (
    requestId: string,
    opts?: { kind?: "connection" | "form"; runId?: string },
  ) => void;
  resolvedFormIds: Set<string>;
  /** True when a later message exists — the user already answered this form. */
  formSuperseded?: boolean;
  fixResolved?: boolean;
  /** True only for messages that arrived after this page session started. */
  isFresh: boolean;
  /** Only the head of the reveal queue animates; others wait. */
  animateNow: boolean;
  onRevealDone?: () => void;
  activityLines?: { id: string; text: string; active?: boolean }[];
  userPrompt?: string;
}) {
  const { t, i18n } = useTranslation(["builder", "common"]);
  const { data: user } = useCurrentUser();
  const isUser = message.role === "user";
  const revealNotified = useRef(false);

  const formRequestId = message.uiComponent?.requestId;
  const skipInstallationForm = isInstallationOnlyForm(message.uiComponent);
  const formLocked =
    message.formResolved ||
    Boolean(formSuperseded) ||
    skipInstallationForm ||
    (formRequestId ? resolvedFormIds.has(formRequestId) : false);
  const formHidden = formLocked || !message.uiComponent || skipInstallationForm;

  const contentKey = message.content.startsWith("builder:") ? message.content : null;
  const isCancelNotice =
    contentKey === "builder:errors.canceledDetail" ||
    contentKey === "builder:errors.canceled";
  let content: string;
  if (formLocked && contentKey === "builder:questions.prompt") {
    content = t("builder:questions.formClosed");
  } else if (formLocked && contentKey === "builder:identity.prompt") {
    content = t("builder:identity.formClosed", {
      name: message.identitySummary?.name ?? "…",
    });
  } else if (
    formLocked &&
    (contentKey === "builder:capabilities.prompt" ||
      contentKey === "builder:capabilities.promptAfterSecret")
  ) {
    content = t("builder:capabilities.formClosed");
  } else if (formLocked && contentKey === "builder:secrets.prompt") {
    content = t("builder:secrets.formClosed");
  } else if (formLocked && contentKey === "builder:toolReview.prompt") {
    content = t("builder:toolReview.formClosed");
  } else if (
    formLocked &&
    (contentKey === "builder:providers.prompt" ||
      contentKey === "builder:providers.promptEmail" ||
      contentKey === "builder:providers.promptCrm" ||
      contentKey === "builder:providers.promptAmbiguous")
  ) {
    content = t("builder:providers.formClosed");
  } else if (contentKey) {
    // Never show raw keys like "connection.prompt" to users.
    const friendlyFallback: Record<string, string> = {
      "builder:connection.prompt":
        "Connect the account(s) below so I can finish building your agent.",
      "builder:connection.required":
        "An account connection is still needed before we can continue.",
      "builder:identity.prompt": "Before I build your agent, tell me how it should introduce itself.",
      "builder:capabilities.prompt":
        "How should this agent start? Chat is always on — add a schedule if you want.",
      "builder:secrets.prompt": "Add an AI provider key so your agent can think.",
      "builder:questions.prompt": "A few quick questions so I build the right agent.",
      "builder:toolReview.prompt":
        "Review the tools for this agent before I build. Remove or add tools, then confirm.",
    };
    content = t(contentKey, {
      defaultValue:
        friendlyFallback[contentKey] ??
        "Continuing with your agent…",
    });
  } else {
    content = stripAttachedPlaceholders(message.content);
  }

  const time = new Intl.DateTimeFormat(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(message.createdAt));

  const showIdentityConfirmed =
    message.card === "identity_confirmed" ||
    (message.identitySummary && message.content.startsWith("builder:identity.confirmed"));
  const showBuildProgress =
    message.card === "build_progress" || Boolean(message.buildBoard);
  const isStaleThinking =
    message.card === "thinking" &&
    !message.content &&
    isStaleInflightMessage(message.createdAt);
  const isBackendFailure =
    isFailureMessageKey(message.content) ||
    message.tone === "warning" ||
    message.tone === "error" ||
    isStaleThinking;
  const showThinking = message.card === "thinking" && !isBackendFailure;
  const showReady = message.card === "ready";

  const animateWrite =
    isFresh &&
    animateNow &&
    !isUser &&
    !showThinking &&
    !showBuildProgress &&
    !isCancelNotice &&
    !isBackendFailure;

  const hasTypeableBody = showIdentityConfirmed || showReady || Boolean(content);
  const [typedDone, setTypedDone] = useState(!animateWrite || !hasTypeableBody);

  const notifyRevealDone = () => {
    if (revealNotified.current) return;
    revealNotified.current = true;
    onRevealDone?.();
  };

  useEffect(() => {
    if (showThinking || showBuildProgress || !animateWrite || typedDone) {
      notifyRevealDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notify parent once when bubble is ready
  }, [showThinking, showBuildProgress, animateWrite, typedDone]);

  if (showThinking) {
    return (
      <MessageEntrance active={isFresh && animateNow}>
        <BuilderWorkingPanel activityLines={activityLines} persistKey={agentId} resumeMode />
      </MessageEntrance>
    );
  }

  if (isStaleThinking && !contentKey) {
    content = t("errors:agentService");
  }

  const showForms = !formHidden && typedDone;
  const runId = message.interruptRunId ?? "";

  const markTyped = () => {
    setTypedDone(true);
  };

  return (
    <MessageEntrance active={isFresh && animateNow}>
      <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
        {isUser ? (
          <Avatar className="mt-1 size-7 shrink-0">
            {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
            <AvatarFallback className="bg-brand/30 text-xs">
              {(user?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ) : (
          <span className="glass mt-1 flex size-7 shrink-0 items-center justify-center rounded-full">
            <LogoMark className="size-4" />
          </span>
        )}

        <div className={cn("min-w-0 max-w-[90%] sm:max-w-[80%]", isUser && "text-right")}>
          <p className="mb-1 flex items-baseline gap-2 font-mono text-[11px] text-muted-foreground/60">
            {isUser ? (
              <>
                <span className="ml-auto">{time}</span>
                <span>{t("builder:you")}</span>
              </>
            ) : (
              <>
                <span>{t("builder:builderName")}</span>
                <span>{time}</span>
              </>
            )}
          </p>
          {isUser ? (
            <MessageAttachmentPreviews attachments={message.attachments} align="right" />
          ) : null}
          <div
            className={cn(
              "min-w-0 text-left text-sm leading-relaxed",
              showForms ? "overflow-visible" : "overflow-hidden",
              isUser
                ? "rounded-3xl bg-brand/15 px-4 py-3 text-foreground"
                : "px-0 py-0 text-foreground/90",
              // Interactive cards keep a light frame; plain chat stays flush.
              !isUser &&
                (showReady || showForms) &&
                "rounded-2xl border border-border/40 bg-foreground/[0.03] px-4 py-3",
              message.tone === "error" && !isCancelNotice && "text-destructive",
              isBackendFailure && !isCancelNotice && "text-amber-800 dark:text-amber-200",
              isUser && !content.trim() && "hidden",
            )}
          >
            {isBackendFailure && !showReady && !isCancelNotice ? (
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
                        surface: "builder",
                        messageId: message.id,
                        threadId: message.threadId,
                        runId: message.interruptRunId,
                        errorKey:
                          contentKey ??
                          (isStaleThinking ? "builder:errors.serviceUnavailable" : undefined),
                        errorSummary: content,
                        staleTimeout: isStaleThinking,
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
            {message.tone === "error" && !showReady && !isCancelNotice && !isBackendFailure ? (
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-destructive">
                <CircleX className="size-3.5" aria-hidden="true" />
                {t("common:status.needsAttention")}
              </p>
            ) : null}
            {message.tone === "warning" && !showReady && !isCancelNotice && !isBackendFailure ? (
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                <AlertTriangle className="size-3.5" aria-hidden="true" />
                {t("common:status.needsAttention")}
              </p>
            ) : null}

            {showIdentityConfirmed && message.identitySummary ? (
              <IdentityConfirmedMessage
                summary={message.identitySummary}
                animate={animateWrite && !typedDone}
                onDone={markTyped}
              />
            ) : showBuildProgress ? (
              <BuildProgressPanel
                steps={message.steps}
                board={message.buildBoard}
                focus={message.focus}
                activityLines={activityLines}
              />
            ) : showReady ? (
              <ReadyCard
                agentId={agentId}
                content={content}
                identitySummary={message.identitySummary}
                actions={message.actions}
                onFix={onFix}
                problems={message.detectedProblems}
                fixResolved={fixResolved}
                animate={animateWrite}
                onDone={markTyped}
              />
            ) : (
              <>
                {content ? (
                  animateWrite && !typedDone && !isCancelNotice ? (
                    <p>
                      <TypewriterText text={content} active onDone={markTyped} />
                    </p>
                  ) : (
                    <Markdown content={content} />
                  )
                ) : null}
                {message.projectFiles && message.projectFiles.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {message.projectFiles.slice(0, 8).map((path) => (
                      <li
                        key={path}
                        className="rounded-md bg-foreground/[0.06] px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground"
                      >
                        {path.split("/").pop() ?? path}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}

            {showForms && message.uiComponent?.type === "agent_identity_form" ? (
              <AgentIdentityForm
                uiComponent={message.uiComponent}
                runId={runId || message.uiComponent.requestId}
                onSubmitted={() => onFormSubmitted?.(formRequestId ?? "")}
              />
            ) : null}

            {showForms &&
            message.uiComponent?.type === "secret_form" &&
            message.uiComponent.context !== "builder" ? (
              <SecretForm
                uiComponent={message.uiComponent}
                agentId={agentId}
                runId={runId || message.uiComponent.requestId}
                onSubmitted={() => onFormSubmitted?.(formRequestId ?? "")}
              />
            ) : null}

            {showForms && message.uiComponent?.type === "agent_capabilities_form" ? (
              <AgentCapabilitiesForm
                uiComponent={message.uiComponent}
                runId={runId || message.uiComponent.requestId}
                onSubmitted={() => onFormSubmitted?.(formRequestId ?? "")}
              />
            ) : null}

            {showForms && message.uiComponent?.type === "dynamic_questions_form" ? (
              <DynamicQuestionsForm
                uiComponent={message.uiComponent}
                runId={runId || message.uiComponent.requestId}
                onSubmitted={() => onFormSubmitted?.(formRequestId ?? "")}
              />
            ) : null}

            {showForms && message.uiComponent?.type === "provider_clarification_form" ? (
              <DynamicQuestionsForm
                uiComponent={message.uiComponent}
                runId={runId || message.uiComponent.requestId}
                variant="providers"
                onSubmitted={() => onFormSubmitted?.(formRequestId ?? "")}
              />
            ) : null}

            {showForms && message.uiComponent?.type === "tool_review_form" ? (
              <ToolReviewForm
                uiComponent={message.uiComponent}
                runId={runId || message.uiComponent.requestId}
                onSubmitted={() => onFormSubmitted?.(formRequestId ?? "")}
              />
            ) : null}

            {showForms &&
            message.uiComponent?.type === "connection_form" &&
            message.uiComponent.context !== "builder" ? (
              <div className="mt-3 space-y-3">
                {(message.uiComponent.connectionRequirements &&
                message.uiComponent.connectionRequirements.length > 0
                  ? message.uiComponent.connectionRequirements
                  : [
                      {
                        provider:
                          message.uiComponent.fields.find((f) => f.key === "provider")
                            ?.suggested_value || "google",
                        appId: message.uiComponent.fields.find(
                          (f) => f.key === "app_id" || f.key === "appId",
                        )?.suggested_value,
                        toolIds: message.uiComponent.fields
                          .filter(
                            (f) =>
                              f.key === "tool_id" ||
                              f.key === "toolId" ||
                              f.key === "tool_ids",
                          )
                          .map((f) => f.suggested_value)
                          .filter((v): v is string => Boolean(v)),
                      },
                    ]
                ).map((req) => (
                  <IntegrationConnectionCard
                    key={`${req.provider}:${req.appId ?? ""}`}
                    agentId={agentId}
                    provider={req.provider || "google"}
                    appId={req.appId}
                    toolIds={req.toolIds}
                    status="needs_setup"
                    onConnected={() =>
                      onFormSubmitted?.(formRequestId ?? "", {
                        kind: "connection",
                        runId: message.interruptRunId ?? undefined,
                      })
                    }
                  />
                ))}
              </div>
            ) : null}

            {showForms && message.uiComponent?.type === "approval_form" ? (
              <div className="mt-3">
                <ToolSetupCard
                  agentId={agentId}
                  uiComponent={message.uiComponent}
                  connectionStatus="needs_setup"
                  onConnected={() =>
                    onFormSubmitted?.(formRequestId ?? "", {
                      kind: "connection",
                      runId: message.interruptRunId ?? undefined,
                    })
                  }
                />
              </div>
            ) : null}

            {!showReady && message.actions && message.actions.length > 0 ? (
              <MessageActions
                actions={message.actions}
                agentId={agentId}
                onFix={onFix}
                problems={message.detectedProblems}
                fixResolved={fixResolved}
              />
            ) : null}
          </div>
        </div>
      </div>
    </MessageEntrance>
  );
}

export function BuildView({ agentId }: { agentId: string }) {
  const { t } = useTranslation(["builder", "common"]);
  const queryClient = useQueryClient();
  const { data: agent } = useAgent(agentId);
  const rawBuilding = agent?.status === "building";
  const [staleBuilding, setStaleBuilding] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  /** Epoch ms of the in-flight send — survives stale refetches & duplicate prompt text. */
  const [pendingToken, setPendingToken] = useState<number | null>(null);
  /** User hit Stop — free the composer even if the in-flight HTTP turn is still pending. */
  const [userStopped, setUserStopped] = useState(() => Boolean(readBuilderStop(agentId)));
  const [modeOverride, setModeOverride] = useState<{
    agentId: string;
    mode: BuilderInteractionMode;
  } | null>(null);
  const interactionMode: BuilderInteractionMode =
    modeOverride?.agentId === agentId
      ? modeOverride.mode
      : (() => {
          if (typeof window === "undefined") return "build";
          try {
            const stored = window.localStorage.getItem(`stack32:builder-mode:${agentId}`);
            return stored === "chat" ? "chat" : "build";
          } catch {
            return "build";
          }
        })();
  const setInteractionMode = (next: BuilderInteractionMode) => {
    setModeOverride({ agentId, mode: next });
  };
  const { data: thread } = useBuilderThread(agentId, {
    // Form continuations leave an ack card (identity_confirmed / capabilities.saved)
    // that isThreadActive treats as idle — production then stops polling and the
    // next form/progress never appears. Poll only while this turn is waiting.
    forcePoll: awaitingReply || pendingToken !== null,
  });
  const sendMessage = useSendBuilderMessage(agentId);
  const openDialog = useUiStore((s) => s.openDialog);
  const sendMutateRef = useRef(sendMessage.mutateAsync);
  sendMutateRef.current = sendMessage.mutateAsync;
  const threadRef = useRef(thread);
  threadRef.current = thread;
  const cancelRun = useCancelBuilderRun(agentId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bootstrappedRef = useRef(false);
  const celebratedIdsRef = useRef<Set<string>>(new Set());
  const [prefill, setPrefill] = useState("");
  const [resolvedFormIds, setResolvedFormIds] = useState<Set<string>>(() => new Set());
  /** Message IDs where the user already clicked Fix it for me. */
  const [fixedMessageIds, setFixedMessageIds] = useState<Set<string>>(() => new Set());
  /** Fresh assistant messages already finished typing (sequential chat reveal). */
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const revealPauseRef = useRef<number | null>(null);
  /** Run ids the user stopped this session — hide their progress immediately.
   *  Held in state (not a ref) because it drives message filtering during render. */
  const [stoppedRunIds, setStoppedRunIds] = useState<Set<string>>(() => {
    const stop = readBuilderStop(agentId);
    return stop?.runId ? new Set([stop.runId]) : new Set();
  });
  /** Message IDs present on first thread snapshot — no typewriter on refresh. */
  const [baselineIds, setBaselineIds] = useState<Set<string> | null>(null);

  // Keep Stop sticky across refresh for this agent tab.
  useEffect(() => {
    const stop = readBuilderStop(agentId);
    if (!stop) {
      setUserStopped(false);
      return;
    }
    setUserStopped(true);
    if (stop.runId) {
      setStoppedRunIds((prev) => {
        if (prev.has(stop.runId!)) return prev;
        const next = new Set(prev);
        next.add(stop.runId!);
        return next;
      });
    }
  }, [agentId]);

  const messages = useMemo(() => thread?.messages ?? [], [thread?.messages]);
  const lastMessageAt = messages.at(-1)?.createdAt;
  const busy = rawBuilding && !staleBuilding;
  const staleRecoveredRef = useRef(false);

  const messageIndex = useMemo(() => {
    const map = new Map<string, number>();
    messages.forEach((m, i) => map.set(m.id, i));
    return map;
  }, [messages]);
  const isFormSuperseded = (message: (typeof messages)[number]) => {
    if (!message.uiComponent && !message.formResolved) return false;
    const idx = messageIndex.get(message.id) ?? -1;
    if (idx < 0) return false;
    // Thinking / progress bubbles must not close an unanswered form (refresh mid-build).
    // A cancel notice does close it — the interrupt was torn down.
    return messages.slice(idx + 1).some(
      (later) =>
        later.role === "assistant" &&
        (isCancelNoticeContent(later.content) ||
          (later.card !== "thinking" &&
            later.card !== "build_progress" &&
            (later.formResolved ||
              later.card === "ready" ||
              later.card === "identity_confirmed" ||
              Boolean(
                later.uiComponent &&
                  later.uiComponent.requestId !== message.uiComponent?.requestId,
              )))),
    );
  };

  const hasOpenBuilderForm = useMemo(
    () =>
      messages.some(
        (m) =>
          Boolean(m.uiComponent) &&
          !isInstallationOnlyForm(m.uiComponent) &&
          !m.formResolved &&
          !isFormSuperseded(m) &&
          !(m.uiComponent?.requestId && resolvedFormIds.has(m.uiComponent.requestId)),
      ),
    // isFormSuperseded closes over messages/messageIndex; list identity is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolvedFormIds + messages drive openness
    [messages, resolvedFormIds],
  );

  // If the agent stays "building" with no new thread activity, the Cloud Tasks
  // worker likely exited early — stop the fake spinner and free the composer.
  // Never treat an unanswered form interrupt as a stuck build (user may take minutes).
  useEffect(() => {
    if (!rawBuilding) {
      setStaleBuilding(false);
      staleRecoveredRef.current = false;
      return;
    }
    if (hasOpenBuilderForm) {
      setStaleBuilding(false);
      staleRecoveredRef.current = false;
      return;
    }
    const STALE_MS = 150_000;
    const anchor = lastMessageAt ? new Date(lastMessageAt).getTime() : Date.now();
    const tick = () => {
      if (Date.now() - anchor < STALE_MS) return;
      setStaleBuilding(true);
      setAwaitingReply(false);
      setPendingToken(null);
    };
    tick();
    const id = window.setInterval(tick, 12_000);
    return () => window.clearInterval(id);
  }, [rawBuilding, lastMessageAt, agentId, hasOpenBuilderForm]);

  // Once we detect a stuck build, cancel so status leaves "building".
  useEffect(() => {
    if (!staleBuilding || !rawBuilding) return;
    if (hasOpenBuilderForm) return;
    if (staleRecoveredRef.current) return;
    staleRecoveredRef.current = true;
    void cancelRun.mutateAsync().catch(() => {
      /* local UI already freed */
    });
  }, [staleBuilding, rawBuilding, cancelRun, hasOpenBuilderForm]);

  // Hide ephemeral thinking / progress only when a *later* turn superseded them —
  // never hide all future progress just because a Ready card exists in history.
  const isCanceledProgress = (m: (typeof messages)[number]) =>
    m.card === "build_progress" &&
    (Boolean(m.content?.includes("canceled")) ||
      m.focus === "Stopped by user" ||
      stoppedRunIds.has(m.interruptRunId ?? ""));

  const visibleMessages = messages
    .filter((m, i) => {
      const later = messages.slice(i + 1);
      if (m.card === "thinking") {
        if (userStopped || stoppedRunIds.has(m.interruptRunId ?? "")) return false;
        return !later.some((x) => x.role === "assistant");
      }
      if (m.card === "build_progress") {
        if (userStopped || isCanceledProgress(m)) return false;
        // New user turn or a final assistant reply supersedes stale progress
        // (otherwise "Updated structure" sticks while a new Fix is running).
        return !later.some(
          (x) =>
            x.role === "user" ||
            (x.role === "assistant" && x.card !== "thinking"),
        );
      }
      return true;
    })
    .filter((m, i, arr) => {
      // Collapse duplicate cancel notices (optimistic/server race or double insert).
      if (m.content !== "builder:errors.canceledDetail") return true;
      const prev = arr[i - 1];
      return prev?.content !== "builder:errors.canceledDetail";
    });

  const lastUserIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === "user") return i;
    }
    return -1;
  })();
  const turnMessages = lastUserIdx >= 0 ? messages.slice(lastUserIdx + 1) : messages;
  const turnHasTerminal = turnHasTerminalReply(messages);

  const liveProgress = [...turnMessages]
    .reverse()
    .find(
      (m) =>
        m.card === "build_progress" &&
        !isCanceledProgress(m) &&
        m.steps?.some((s) => s.state === "running" || s.state === "pending"),
    );
  const workingOperations: BuilderOperation[] | undefined = liveProgress?.steps?.map((step) => ({
    event: `step.${step.labelKey}`,
    state: step.state === "failed" ? "done" : step.state,
    detail: step.state === "running" ? liveProgress.focus : undefined,
  }));

  // Only bind activity to the *current* turn's in-flight run (ignore canceled leftovers).
  const messageRunId =
    [...turnMessages]
      .reverse()
      .find(
        (m) =>
          Boolean(m.interruptRunId) &&
          !stoppedRunIds.has(m.interruptRunId ?? "") &&
          (m.card === "thinking" ||
            (m.card === "build_progress" &&
              !isCanceledProgress(m) &&
              m.steps?.some((s) => s.state === "running" || s.state === "pending"))),
      )?.interruptRunId ?? null;

  // After a hard refresh, thinking cards may be gone while the run is still queued/running.
  // Resume from the latest active build run so live events continue where they left off.
  const activeBuildRunQuery = useQuery({
    queryKey: ["active-build-run", agentId],
    enabled: Boolean(agentId),
    staleTime: 4000,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
    notifyOnChangeProps: ["data", "error"],
    refetchInterval: (q) => {
      const row = q.state.data as { id?: string; status?: string } | null | undefined;
      if (row?.status === "queued" || row?.status === "running") return 2200;
      if (rawBuilding || awaitingReply || pendingToken !== null) return 2200;
      return false;
    },
    queryFn: async () => {
      const supabase = requireSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("runs")
        .select("id,status,created_at,error_code")
        .eq("agent_id", agentId)
        .eq("run_type", "build")
        .in("status", ["queued", "running", "waiting_for_input"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Interrupted builds wait on a form — they must not drive "resume working" / auto-await.
  const serverBuildRunId =
    !turnHasTerminal &&
    activeBuildRunQuery.data &&
    (activeBuildRunQuery.data.status === "queued" ||
      activeBuildRunQuery.data.status === "running") &&
    activeBuildRunQuery.data.error_code !== "BUILDER_INTERRUPTED"
      ? activeBuildRunQuery.data.id
      : null;
  const activeRunId = turnHasTerminal
    ? null
    : ((messageRunId && !stoppedRunIds.has(messageRunId) ? messageRunId : null) ??
      (serverBuildRunId && !stoppedRunIds.has(serverBuildRunId) ? serverBuildRunId : null));

  // Resume local "turn in progress" UI after refresh when the server still has a build.
  // Skip while a form is open — that is intentional waiting, not an in-flight compile.
  // Never revive a turn the user already stopped (session flag or cancel notice).
  useEffect(() => {
    if (!serverBuildRunId) return;
    if (turnHasTerminal) return;
    if (userStopped || readBuilderStop(agentId)) return;
    if (hasOpenBuilderForm) return;
    const last = messages.at(-1);
    if (isCancelNoticeContent(last?.content)) return;
    if (stoppedRunIds.has(serverBuildRunId)) return;
    setAwaitingReply(true);
    setPendingToken((prev) => prev ?? Date.now());
  }, [
    serverBuildRunId,
    userStopped,
    hasOpenBuilderForm,
    agentId,
    messages,
    stoppedRunIds,
    turnHasTerminal,
  ]);

  const activityEnabled =
    !turnHasTerminal &&
    Boolean(activeRunId) &&
    !userStopped &&
    !hasOpenBuilderForm &&
    !staleBuilding &&
    (awaitingReply ||
      pendingToken !== null ||
      sendMessage.isPending ||
      busy ||
      Boolean(serverBuildRunId) ||
      Boolean(liveProgress) ||
      turnMessages.some((m) => m.card === "thinking"));
  const { data: runEvents = [] } = useRunActivity(activeRunId, activityEnabled);
  // Never keep stale run activity under a finished Ready card (placeholderData
  // would otherwise leave "Repairing / Thinking" visible after the turn ends).
  const turnIsChat =
    messages[lastUserIdx]?.interactionMode === "chat" ||
    (messages[lastUserIdx]?.interactionMode == null && interactionMode === "chat");
  const activityLines = activityEnabled
    ? summarizeActivity(runEvents, {
        readOnly: turnIsChat,
      }).lines.map((line) => {
        const text = t(`builder:activity.${line.key}`, {
          ...(line.params ?? {}),
          defaultValue: line.key,
        });
        return {
          id: line.id,
          text: text.charAt(0).toUpperCase() + text.slice(1),
          active: line.active,
        };
      })
    : [];


  const lastMessage = visibleMessages.at(-1) ?? messages.at(-1);
  const lastIsUser = lastMessage?.role === "user";
  const lastIsThinking = lastMessage?.card === "thinking";
  const lastIsReady = lastMessage?.card === "ready";
  const lastIsCancel = isCancelNoticeContent(lastMessage?.content);
  const progressInFlight =
    lastMessage?.card === "build_progress" &&
    Boolean(
      lastMessage.steps?.some((s) => s.state === "running" || s.state === "pending"),
    );
  const workInFlight = lastIsThinking || progressInFlight;
  const waitingOnForm = hasOpenBuilderForm;
  const hasVisibleWorkingBubble = isWorkingCard(lastMessage);
  // Keep a local working panel whenever the turn is still active but the server
  // thinking/progress bubble is missing (common gap after "Settings saved").
  // Never invent a working panel after a cancel / while a form is unanswered /
  // when the backend agent is idle (grey).
  const buildTurnActive =
    !turnHasTerminal &&
    !userStopped &&
    !lastIsReady &&
    !lastIsCancel &&
    !staleBuilding &&
    !waitingOnForm &&
    (awaitingReply ||
      pendingToken !== null ||
      sendMessage.isPending ||
      busy ||
      workInFlight ||
      Boolean(serverBuildRunId) ||
      Boolean(liveProgress) ||
      turnMessages.some((m) => m.card === "thinking") ||
      (lastIsUser && sendMessage.isPending));
  const showLocalWorking =
    buildTurnActive && !waitingOnForm && !hasVisibleWorkingBubble;
  const resumeWorking =
    Boolean(serverBuildRunId) || Boolean(activeRunId && activityLines.length > 0);
  // Keep Stop available for the whole in-flight turn (not only while awaitingReply).
  // Ready is terminal — never keep Stop / busy composer over a Ready card.
  const composerBusy =
    !userStopped &&
    !waitingOnForm &&
    !lastIsReady &&
    !lastIsCancel &&
    (buildTurnActive || cancelRun.isPending);

  const pendingReveal = visibleMessages.filter(
    (m) =>
      m.role === "assistant" &&
      baselineIds !== null &&
      !baselineIds.has(m.id) &&
      !revealedIds.has(m.id) &&
      // Working cards must never wait behind typewriter queue — they fill the gap.
      !isWorkingCard(m),
  );
  const activeRevealId = pendingReveal[0]?.id ?? null;

  useEffect(() => {
    if (!thread || baselineIds !== null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time baseline snapshot from the first server thread load
    setBaselineIds(new Set(thread.messages.map((m) => m.id)));
  }, [thread, baselineIds]);

  useEffect(() => {
    return () => {
      if (revealPauseRef.current !== null) {
        window.clearTimeout(revealPauseRef.current);
      }
    };
  }, []);

  const markRevealed = (messageId: string) => {
    if (revealPauseRef.current !== null) {
      window.clearTimeout(revealPauseRef.current);
    }
    // Short beat between bubbles so it reads like a real conversation.
    revealPauseRef.current = window.setTimeout(() => {
      setRevealedIds((prev) => {
        if (prev.has(messageId)) return prev;
        const next = new Set(prev);
        next.add(messageId);
        return next;
      });
      revealPauseRef.current = null;
    }, 650);
  };

  const handleStop = () => {
    const runToStop = activeRunId;
    if (runToStop) {
      setStoppedRunIds((prev) => {
        const next = new Set(prev);
        next.add(runToStop);
        return next;
      });
    }
    writeBuilderStop(agentId, runToStop);
    // Free UI immediately — with QUEUE_INLINE, sendMessage stays pending until the
    // server finishes, which made Stop look broken.
    setUserStopped(true);
    setPendingToken(null);
    setAwaitingReply(false);
    void cancelRun.mutateAsync().catch(() => {
      /* local fallback already handled in cancelBuilderRun */
    });
  };

  const handleSend = async (
    value: string,
    attachments?: ComposerAttachment[],
    options?: { mode?: BuilderInteractionMode },
  ) => {
    // eslint-disable-next-line react-hooks/purity -- event handler; epoch token pairs the in-flight turn with its clear effect
    const token = Date.now();
    clearBuilderStop(agentId);
    setUserStopped(false);
    setPendingToken(token);
    setAwaitingReply(true);
    const sentMode = options?.mode ?? interactionMode;
    try {
      await sendMessage.mutateAsync({
        content: value,
        attachments,
        mode: sentMode,
      });
    } catch (error) {
      setPendingToken(null);
      setAwaitingReply(false);
      if (isUpgradeGateError(error)) {
        openDialog("upgrade");
      }
      // Re-throw so PromptComposer keeps the typed draft.
      throw error;
    }
  };

  // Clear waiting when the turn produces a terminal assistant reply.
  // Critical: form continuations set awaitingReply without a new user message, so we
  // must NOT require pendingToken — otherwise Ready stays under a stuck "working" UI.
  useEffect(() => {
    if (!awaitingReply && pendingToken === null) return;

    // The continuation we were waiting for is a new form — stop the working
    // poll so filling it does not keep refetching in the background.
    if (waitingOnForm) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- next form arrived; end the local waiting turn
      setPendingToken(null);
      setAwaitingReply(false);
      return;
    }

    const last = messages.at(-1);
    const readyTerminal = last?.role === "assistant" && last.card === "ready";
    const contentTerminal = isTerminalAssistantMessage(last);

    let hasFinalFromSend = false;
    if (pendingToken !== null) {
      let anchorIdx = -1;
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const m = messages[i];
        if (m?.role !== "user") continue;
        if (m.id.startsWith("optimistic-")) {
          anchorIdx = i;
          break;
        }
        const created = new Date(m.createdAt).getTime();
        if (Number.isFinite(created) && created >= pendingToken - 5000) {
          anchorIdx = i;
          break;
        }
      }
      if (anchorIdx >= 0) {
        hasFinalFromSend = messages.slice(anchorIdx + 1).some(
          (m) =>
            m.role === "assistant" &&
            m.card !== "thinking" &&
            m.card !== "build_progress" &&
            !isEphemeralBuilderAck(m) &&
            Boolean(m.uiComponent || m.card || m.content),
        );
      }
    }

    if (!readyTerminal && !contentTerminal && !hasFinalFromSend) return;
    if (isEphemeralBuilderAck(last)) return;
    // Keep waiting through mid-build acks only — a substantive reply ends the turn
    // even if agent status or run row lag behind for a few seconds.
    if (!readyTerminal && !contentTerminal && busy) return;
    setPendingToken(null);
    setAwaitingReply(false);
    if (turnHasTerminal) {
      void queryClient.invalidateQueries({ queryKey: ["active-build-run", agentId] });
    }
  }, [messages, pendingToken, awaitingReply, busy, waitingOnForm, agentId, queryClient, turnHasTerminal]);


  // Consume the landing-page pending prompt exactly once, on an empty thread.
  useEffect(() => {
    if (!thread || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    if (thread.messages.length === 0) {
      const pending = consumePendingPrompt();
      if (pending) {
        setPendingToken(Date.now());
        setAwaitingReply(true);
        void sendMessage.mutateAsync(pending);
      }
    }
  }, [thread, sendMessage]);

  const threadReady = Boolean(thread);

  // Try to fix / Structure prefill — independent of bootstrappedRef so returning
  // to Build still sends the repair prompt as a user message.
  useEffect(() => {
    if (!threadReady) return;
    const currentThread = threadRef.current;
    if (!currentThread) return;
    const sending = takePrefillSending();
    const payload = consumePrefillPayload();
    const draft = payload.draft ?? sending;
    if (!draft && !payload.autoSend && !sending) return;

    // Banner already posted the repair (markPrefillSending). Never double-send.
    if (sending) {
      setUserStopped(false);
      setPendingToken(Date.now());
      setAwaitingReply(true);
      return;
    }

    const last = currentThread.messages[currentThread.messages.length - 1];
    const alreadyQueued = Boolean(draft && last?.role === "user" && last.content === draft);
    const builderBusy = isThreadActive(currentThread);

    if (payload.autoSend) {
      // If Build is already working, only show the draft — do not enqueue another turn.
      if (builderBusy || alreadyQueued) {
        if (draft && !alreadyQueued) setPrefill(draft);
        return;
      }
      setUserStopped(false);
      setPendingToken(Date.now());
      setAwaitingReply(true);
      if (draft) {
        void sendMutateRef.current(draft).catch(() => {
          setPrefill(draft);
          setPendingToken(null);
          setAwaitingReply(false);
        });
      }
      return;
    }
    if (draft) setPrefill(draft);
  }, [agentId, threadReady]);

  // Follow the live conversation while it grows (activity lines, typewriter, forms).
  // Previously we only re-pinned on message count, so new activity wrote under the
  // composer until the turn finished — then jumped. Keep sticky while work is in
  // flight, unless the user scrolled up to read history.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const NEAR_BOTTOM_PX = 160;
    let pinned =
      root.scrollHeight - root.scrollTop - root.clientHeight <= NEAR_BOTTOM_PX;

    const stick = () => {
      if (!pinned) return;
      root.scrollTop = root.scrollHeight;
    };

    const onScroll = () => {
      const distance = root.scrollHeight - root.scrollTop - root.clientHeight;
      pinned = distance <= NEAR_BOTTOM_PX;
    };
    root.addEventListener("scroll", onScroll, { passive: true });

    const liveFollowing =
      showLocalWorking ||
      composerBusy ||
      awaitingReply ||
      pendingToken !== null ||
      Boolean(activeRevealId) ||
      activityLines.length > 0;

    let raf = 0;
    const tick = () => {
      stick();
      if (liveFollowing) raf = window.requestAnimationFrame(tick);
    };
    stick();
    if (liveFollowing) raf = window.requestAnimationFrame(tick);

    const resize =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => stick())
        : null;
    resize?.observe(root);
    const content = root.querySelector("[data-builder-scroll-content]");
    if (content) resize?.observe(content);

    const mutate =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => stick())
        : null;
    mutate?.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      root.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
      resize?.disconnect();
      mutate?.disconnect();
    };
  }, [
    showLocalWorking,
    composerBusy,
    awaitingReply,
    pendingToken,
    activeRevealId,
    activityLines.length,
    messages.length,
    revealedIds.size,
  ]);

  useEffect(() => {
    // Wait until baseline is known so refresh never re-chimes historical Ready cards.
    if (baselineIds === null) return;
    for (const message of messages) {
      if (!message.playReadySound) continue;
      if (celebratedIdsRef.current.has(message.id)) continue;
      // Historical Ready from a prior session/load — never play again.
      if (baselineIds.has(message.id)) {
        celebratedIdsRef.current.add(message.id);
        continue;
      }
      celebratedIdsRef.current.add(message.id);
      playAgentReadyChime();
      break;
    }
  }, [messages, baselineIds]);

  const refreshAfterForm = (
    requestId: string,
    opts?: { kind?: "connection" | "form"; runId?: string },
  ) => {
    if (requestId) {
      setResolvedFormIds((prev) => new Set(prev).add(requestId));
    }
    setUserStopped(false);
    // Same contract as handleSend: pair awaitingReply with a token so the clear
    // effect can distinguish this continuation from older thread messages.
    setPendingToken(Date.now());
    setAwaitingReply(true);
    void queryClient.invalidateQueries({ queryKey: ["builder", agentId] });
    void queryClient.invalidateQueries({ queryKey: ["agents"] });
    if (opts?.kind === "connection") {
      void import("@/lib/actions/builder").then(({ resumeBuilderConnection }) =>
        resumeBuilderConnection({
          agentId,
          runId: opts.runId,
        })
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: ["builder", agentId] });
            void queryClient.invalidateQueries({ queryKey: ["agents"] });
          })
          .catch(() => {
            /* keep polling; user can retry Connect */
          }),
      );
    }
  };

  const examples = [
    "Create an agent that researches a company, scores the lead and drafts a personalized email.",
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        className="scrollbar-thin relative min-h-0 flex-1 overflow-y-auto px-4"
        role="log"
        aria-label={t("builder:a11y.conversation")}
        aria-live="polite"
      >
        <div
          data-builder-scroll-content
          className="relative mx-auto max-w-3xl space-y-6 pt-8 pb-16"
        >
          {messages.length === 0 && !showLocalWorking ? (
            <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
              <span className="glass mb-6 flex size-14 items-center justify-center rounded-3xl">
                <LogoMark className="size-7" />
              </span>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl md:text-3xl">
                {t("builder:empty.title")}
              </h1>
              <p className="mt-3 max-w-md text-sm text-muted-foreground">
                {t("builder:empty.subtitle")}
              </p>
              <p className="mt-8 font-mono text-[11px] tracking-[0.18em] text-muted-foreground/60 uppercase">
                {t("builder:empty.examplesTitle")}
              </p>
              <button
                type="button"
                className="glass mt-3 max-w-md rounded-2xl px-4 py-3 text-sm text-foreground/80 transition-colors hover:bg-foreground/[0.04]"
                onClick={() => void handleSend(examples[0])}
              >
                “{examples[0]}”
              </button>
            </div>
          ) : (
            <>
              {visibleMessages.map((message) => {
                const isFresh =
                  baselineIds !== null && !baselineIds.has(message.id);
                const isWorking = isWorkingCard(message);
                const isPendingFresh =
                  isFresh &&
                  message.role === "assistant" &&
                  !revealedIds.has(message.id) &&
                  message.id !== activeRevealId &&
                  !isWorking;
                // Hold later assistant bubbles until the previous one finishes typing.
                // Working cards always render immediately (fills silent build gaps).
                if (isPendingFresh) return null;
                return (
                  <BuilderBubble
                    key={message.id}
                    message={message}
                    agentId={agentId}
                    userPrompt={promptBeforeMessage(messages, message.id)}
                    resolvedFormIds={resolvedFormIds}
                    formSuperseded={isFormSuperseded(message)}
                    fixResolved={fixedMessageIds.has(message.id)}
                    isFresh={isFresh}
                    animateNow={
                      isWorking ||
                      (message.role === "assistant" && message.id === activeRevealId)
                    }
                    activityLines={
                      isWorking &&
                      message.id === (visibleMessages.at(-1)?.id ?? "")
                        ? activityLines
                        : undefined
                    }
                    onRevealDone={
                      isFresh && message.role === "assistant"
                        ? () => markRevealed(message.id)
                        : undefined
                    }
                    onFix={() => {
                      if (fixedMessageIds.has(message.id)) return;
                      const problems = (message.detectedProblems ?? [])
                        .filter(Boolean)
                        .map(humanizeProblemText);
                      const prompt =
                        problems.length > 0
                          ? t("builder:actions.fixPrompt", {
                              problems: problems.map((p) => `• ${p}`).join("\n"),
                            })
                          : t("builder:actions.fixPromptEmpty");
                      setFixedMessageIds((prev) => {
                        const next = new Set(prev);
                        next.add(message.id);
                        return next;
                      });
                      void handleSend(prompt);
                    }}
                    onFormSubmitted={(requestId, opts) => {
                      refreshAfterForm(requestId, opts);
                    }}
                  />
                );
              })}
              {showLocalWorking ? (
                <MessageEntrance active>
                  <BuilderWorkingPanel
                    operations={workingOperations}
                    activityLines={activityLines}
                    persistKey={agentId}
                    resumeMode={resumeWorking || Boolean(serverBuildRunId)}
                  />
                </MessageEntrance>
              ) : null}
              {staleBuilding ? (
                <MessageEntrance active>
                  <div className="mx-auto max-w-3xl rounded-2xl border border-destructive/30 bg-destructive/[0.06] px-4 py-3 text-sm text-destructive">
                    <p className="font-medium">{t("builder:errors.buildStuck")}</p>
                    <p className="mt-1 text-destructive/90">
                      {t("builder:errors.buildStuckDetail")}
                    </p>
                  </div>
                </MessageEntrance>
              ) : null}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 px-4 pb-5">
        <PromptComposer
          className="mx-auto max-w-3xl"
          placeholder={
            waitingOnForm
              ? t("builder:composer.formLockedPlaceholder")
              : interactionMode === "chat"
                ? t("builder:composer.chatPlaceholder")
                : t("builder:composer.placeholder")
          }
          onSubmit={(value, attachments, options) => handleSend(value, attachments, options)}
          onStop={handleStop}
          busy={composerBusy}
          disabled={waitingOnForm}
          autoFocus={messages.length === 0}
          initialValue={prefill}
          draftKey={`builder:${agentId}`}
          showModeSelector
          mode={interactionMode}
          onModeChange={(next) => {
            setInteractionMode(next);
            try {
              window.localStorage.setItem(`stack32:builder-mode:${agentId}`, next);
            } catch {
              /* ignore */
            }
          }}
        />
      </div>
    </div>
  );
}
