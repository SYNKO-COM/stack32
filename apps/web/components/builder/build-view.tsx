"use client";

import { AlertTriangle, CircleX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { AgentCapabilitiesForm } from "@/components/builder/agent-capabilities-form";
import { AgentIdentityForm } from "@/components/builder/agent-identity-form";
import { BuildProgressPanel } from "@/components/builder/build-progress-panel";
import { BuilderWorkingPanel } from "@/components/builder/builder-working-panel";
import { DynamicQuestionsForm } from "@/components/builder/dynamic-questions-form";
import { IntegrationConnectionCard } from "@/components/builder/integration-connection-card";
import { MessageEntrance, TypewriterText } from "@/components/builder/message-motion";
import { IdentityConfirmedMessage, ReadyCard } from "@/components/builder/ready-card";
import { SecretForm } from "@/components/builder/secret-form";
import { ToolSetupCard } from "@/components/builder/tool-setup-card";
import { LogoMark } from "@/components/shared/logo";
import { Markdown } from "@/components/shared/markdown";
import { PromptComposer } from "@/components/shared/prompt-composer";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAgent } from "@/hooks/use-agents";
import { useCurrentUser } from "@/hooks/use-auth";
import {
  useBuilderThread,
  useCancelBuilderRun,
  useSendBuilderMessage,
} from "@/hooks/use-builder";
import { summarizeActivity, useRunActivity } from "@/hooks/use-run-activity";
import { useTranslation } from "@/hooks/use-translation";
import { playAgentReadyChime } from "@/lib/audio/agent-ready-chime";
import type { BuilderAction, BuilderMessage } from "@/lib/domain/types";
import { consumePendingPrompt, consumePrefillDraft } from "@/lib/pending-prompt";
import { cn } from "@/lib/utils";
import type { BuilderOperation } from "@/components/builder/builder-working-panel";

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
            if (action === "test_agent") {
              return (
                <Button
                  key={action}
                  size="sm"
                  className="rounded-full"
                  onClick={() => router.push(`/agents/${agentId}/agent`)}
                >
                  {t("actions.testAgent")}
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

function BuilderBubble({
  message,
  agentId,
  onFix,
  onFormSubmitted,
  onSuggestion,
  resolvedFormIds,
  formSuperseded,
  fixResolved = false,
  isFresh,
  animateNow,
  onRevealDone,
  activityLines,
}: {
  message: BuilderMessage;
  agentId: string;
  onFix: () => void;
  onFormSubmitted?: (
    requestId: string,
    opts?: { kind?: "connection" | "form"; runId?: string },
  ) => void;
  onSuggestion?: (prompt: string) => void;
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
}) {
  const { t, i18n } = useTranslation(["builder", "common"]);
  const { data: user } = useCurrentUser();
  const isUser = message.role === "user";
  const revealNotified = useRef(false);

  const formRequestId = message.uiComponent?.requestId;
  const formLocked =
    message.formResolved ||
    Boolean(formSuperseded) ||
    (formRequestId ? resolvedFormIds.has(formRequestId) : false);
  const formHidden = formLocked || !message.uiComponent;

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
  } else if (contentKey) {
    // Never show raw keys like "connection.prompt" to users.
    const friendlyFallback: Record<string, string> = {
      "builder:connection.prompt":
        "Connect the account(s) below so I can finish building your agent.",
      "builder:connection.required":
        "An account connection is still needed before we can continue.",
      "builder:identity.prompt": "Before I build your agent, tell me how it should introduce itself.",
      "builder:capabilities.prompt": "Almost there. Tell me how this agent should work.",
      "builder:secrets.prompt": "Add an AI provider key so your agent can think.",
      "builder:questions.prompt": "A few quick questions so I build the right agent.",
    };
    content = t(contentKey, {
      defaultValue:
        friendlyFallback[contentKey] ??
        "Continuing with your agent…",
    });
  } else {
    content = message.content;
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
  const showThinking = message.card === "thinking";
  const showReady = message.card === "ready";

  const animateWrite =
    isFresh &&
    animateNow &&
    !isUser &&
    !showThinking &&
    !showBuildProgress &&
    !isCancelNotice;

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
        <BuilderWorkingPanel activityLines={activityLines} />
      </MessageEntrance>
    );
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
            <AvatarFallback className="bg-brand/30 text-xs">
              {(user?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ) : (
          <span className="glass mt-1 flex size-7 shrink-0 items-center justify-center rounded-full">
            <LogoMark className="size-4" />
          </span>
        )}

        <div className={cn("max-w-[90%] sm:max-w-[80%]", isUser && "text-right")}>
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
          <div
            className={cn(
              "text-left text-sm leading-relaxed",
              isUser
                ? "rounded-3xl bg-brand/15 px-4 py-3 text-foreground"
                : "px-0 py-0 text-foreground/90",
              // Interactive cards keep a light frame; plain chat stays flush.
              !isUser &&
                (showReady || showForms) &&
                "rounded-2xl border border-border/40 bg-foreground/[0.03] px-4 py-3",
              message.tone === "error" && !isCancelNotice && "text-destructive",
            )}
          >
            {message.tone === "error" && !showReady && !isCancelNotice ? (
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-destructive">
                <CircleX className="size-3.5" aria-hidden="true" />
                {t("common:status.needsAttention")}
              </p>
            ) : null}
            {message.tone === "warning" && !showReady && !isCancelNotice ? (
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

            {showForms && message.uiComponent?.type === "secret_form" ? (
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

            {showForms && message.uiComponent?.type === "connection_form" ? (
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
  const busy = agent?.status === "building";
  const [awaitingReply, setAwaitingReply] = useState(false);
  /** User hit Stop — free the composer even if the in-flight HTTP turn is still pending. */
  const [userStopped, setUserStopped] = useState(false);
  const { data: thread } = useBuilderThread(agentId, {
    forcePoll: busy || awaitingReply,
  });
  const sendMessage = useSendBuilderMessage(agentId);
  const cancelRun = useCancelBuilderRun(agentId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bootstrappedRef = useRef(false);
  const celebratedIdsRef = useRef<Set<string>>(new Set());
  /** Epoch ms of the in-flight send — survives stale refetches & duplicate prompt text. */
  const [pendingToken, setPendingToken] = useState<number | null>(null);
  const [prefill, setPrefill] = useState("");
  const [resolvedFormIds, setResolvedFormIds] = useState<Set<string>>(() => new Set());
  /** Message IDs where the user already clicked Fix it for me. */
  const [fixedMessageIds, setFixedMessageIds] = useState<Set<string>>(() => new Set());
  /** Fresh assistant messages already finished typing (sequential chat reveal). */
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const revealPauseRef = useRef<number | null>(null);
  /** Run ids the user stopped this session — hide their progress immediately. */
  const stoppedRunIdsRef = useRef<Set<string>>(new Set());
  const [, bumpStopped] = useState(0);
  /** Message IDs present on first thread snapshot — no typewriter on refresh. */
  const [baselineIds, setBaselineIds] = useState<Set<string> | null>(null);

  const messages = useMemo(() => thread?.messages ?? [], [thread?.messages]);
  if (thread && baselineIds === null) {
    setBaselineIds(new Set(thread.messages.map((m) => m.id)));
  }

  const messageIndex = useMemo(() => {
    const map = new Map<string, number>();
    messages.forEach((m, i) => map.set(m.id, i));
    return map;
  }, [messages]);
  const isFormSuperseded = (message: (typeof messages)[number]) => {
    if (!message.uiComponent && !message.formResolved) return false;
    const idx = messageIndex.get(message.id) ?? -1;
    if (idx < 0) return false;
    // Any later message means this step already continued — lock the form.
    return messages.slice(idx + 1).length > 0;
  };
  const hasLiveForm = messages.some(
    (m) =>
      Boolean(m.uiComponent) &&
      !m.formResolved &&
      !isFormSuperseded(m) &&
      !(m.uiComponent?.requestId && resolvedFormIds.has(m.uiComponent.requestId)),
  );
  // Hide ephemeral thinking / progress only when a *later* turn superseded them —
  // never hide all future progress just because a Ready card exists in history.
  const isCanceledProgress = (m: (typeof messages)[number]) =>
    m.card === "build_progress" &&
    (Boolean(m.content?.includes("canceled")) ||
      m.focus === "Stopped by user" ||
      stoppedRunIdsRef.current.has(m.interruptRunId ?? ""));

  const visibleMessages = messages
    .filter((m, i) => {
      const later = messages.slice(i + 1);
      if (m.card === "thinking") {
        if (userStopped || stoppedRunIdsRef.current.has(m.interruptRunId ?? "")) return false;
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
  const activeRunId =
    [...turnMessages]
      .reverse()
      .find(
        (m) =>
          Boolean(m.interruptRunId) &&
          !stoppedRunIdsRef.current.has(m.interruptRunId ?? "") &&
          (m.card === "thinking" ||
            (m.card === "build_progress" &&
              !isCanceledProgress(m) &&
              m.steps?.some((s) => s.state === "running" || s.state === "pending"))),
      )?.interruptRunId ?? null;
  const activityEnabled =
    Boolean(activeRunId) &&
    (awaitingReply ||
      sendMessage.isPending ||
      busy ||
      Boolean(liveProgress) ||
      turnMessages.some((m) => m.card === "thinking"));
  const { data: runEvents = [] } = useRunActivity(activeRunId, activityEnabled);
  // Never keep stale run activity under a finished Ready card (placeholderData
  // would otherwise leave "Repairing / Thinking" visible after the turn ends).
  const activityLines = activityEnabled
    ? summarizeActivity(runEvents).lines.map((line) => {
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
  const progressInFlight =
    lastMessage?.card === "build_progress" &&
    Boolean(
      lastMessage.steps?.some((s) => s.state === "running" || s.state === "pending"),
    );
  const workInFlight = lastIsThinking || progressInFlight;
  const waitingOnForm = Boolean(
    lastMessage?.uiComponent &&
      !lastMessage.formResolved &&
      !isFormSuperseded(lastMessage) &&
      !(lastMessage.uiComponent.requestId && resolvedFormIds.has(lastMessage.uiComponent.requestId)),
  );
  const showLocalWorking =
    !userStopped &&
    !waitingOnForm &&
    !lastIsThinking &&
    !lastIsReady &&
    lastMessage?.card !== "build_progress" &&
    (awaitingReply ||
      pendingToken !== null ||
      sendMessage.isPending ||
      (busy && lastIsUser));
  // Keep Stop available for the whole in-flight turn (not only while awaitingReply).
  // Ready is terminal — never keep Stop / busy composer over a Ready card.
  const composerBusy =
    !userStopped &&
    !waitingOnForm &&
    !lastIsReady &&
    (awaitingReply ||
      pendingToken !== null ||
      sendMessage.isPending ||
      cancelRun.isPending ||
      workInFlight ||
      (busy && !lastMessage?.uiComponent));

  const pendingReveal = visibleMessages.filter(
    (m) =>
      m.role === "assistant" &&
      baselineIds !== null &&
      !baselineIds.has(m.id) &&
      !revealedIds.has(m.id),
  );
  const activeRevealId = pendingReveal[0]?.id ?? null;

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
      stoppedRunIdsRef.current.add(runToStop);
      bumpStopped((n) => n + 1);
    }
    // Free UI immediately — with QUEUE_INLINE, sendMessage stays pending until the
    // server finishes, which made Stop look broken.
    setUserStopped(true);
    setPendingToken(null);
    setAwaitingReply(false);
    void cancelRun.mutateAsync().catch(() => {
      /* local fallback already handled in cancelBuilderRun */
    });
  };

  const handleSend = async (value: string) => {
    const token = Date.now();
    setUserStopped(false);
    setPendingToken(token);
    setAwaitingReply(true);
    try {
      await sendMessage.mutateAsync(value);
    } catch {
      setPendingToken(null);
      setAwaitingReply(false);
    }
  };

  const lastFocus = messages.at(-1)?.focus;
  const lastSteps = messages.at(-1)?.steps;

  // Clear waiting when the turn produces a terminal assistant reply.
  // Critical: form continuations set awaitingReply without a new user message, so we
  // must NOT require pendingToken — otherwise Ready stays under a stuck "working" UI.
  useEffect(() => {
    if (!awaitingReply && pendingToken === null) return;

    const last = messages.at(-1);
    const readyTerminal = last?.role === "assistant" && last.card === "ready";
    const contentTerminal =
      last?.role === "assistant" &&
      last.card !== "thinking" &&
      last.card !== "build_progress" &&
      last.card !== "identity_confirmed" &&
      !last.uiComponent &&
      Boolean(last.content || (last.actions && last.actions.length > 0));

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
            Boolean(m.uiComponent || m.card || m.content),
        );
      }
    }

    if (!readyTerminal && !contentTerminal && !hasFinalFromSend) return;
    setPendingToken(null);
    setAwaitingReply(false);
  }, [messages, pendingToken, awaitingReply]);


  // Consume the landing-page pending prompt exactly once, on an empty thread.
  useEffect(() => {
    if (!thread || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    if (thread.messages.length === 0) {
      const pending = consumePendingPrompt();
      if (pending) {
        const timer = window.setTimeout(() => {
          setPendingToken(Date.now());
          setAwaitingReply(true);
          void sendMessage.mutateAsync(pending);
        }, 0);
        return () => window.clearTimeout(timer);
      }
    }
    const draft = consumePrefillDraft();
    if (draft) {
      const timeout = window.setTimeout(() => setPrefill(draft), 0);
      return () => window.clearTimeout(timeout);
    }
  }, [thread, sendMessage]);

  useEffect(() => {
    const el = scrollRef.current;
    const anchor = bottomRef.current;
    if (!el || !anchor) return;
    // Keep the live conversation above the composer (safety scroll).
    const pin = () => {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      el.scrollTop = el.scrollHeight;
    };
    pin();
    const raf = window.requestAnimationFrame(pin);
    return () => window.cancelAnimationFrame(raf);
  }, [
    messages.length,
    busy,
    showLocalWorking,
    activeRevealId,
    revealedIds.size,
    lastFocus,
    lastSteps,
    activityLines.length,
    workInFlight,
    composerBusy,
  ]);

  // Keep pinned while content grows (typewriter / activity lines).
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      root.scrollTop = root.scrollHeight;
    });
    observer.observe(root);
    const inner = root.firstElementChild;
    if (inner) observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Wait until baseline is known so refresh never re-chimes historical Ready cards.
    if (baselineIds === null) return;
    const soundMsgs = messages.filter((m) => m.playReadySound);
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
        {/* Stronger frosted film behind the Build conversation */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
        >
          <div className="h-full w-full bg-background/55 backdrop-blur-md [mask-image:linear-gradient(to_bottom,transparent_0%,rgba(0,0,0,0.55)_6%,black_18%,black_78%,rgba(0,0,0,0.6)_90%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0%,rgba(0,0,0,0.55)_6%,black_18%,black_78%,rgba(0,0,0,0.6)_90%,transparent_100%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/50 to-background/70" />
        </div>
        <div className="relative z-[1] mx-auto max-w-3xl space-y-6 py-8">
          {messages.length === 0 && !showLocalWorking ? (
            <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
              <span className="glass mb-6 flex size-14 items-center justify-center rounded-3xl">
                <LogoMark className="size-7" />
              </span>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
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
                const isPendingFresh =
                  isFresh &&
                  message.role === "assistant" &&
                  !revealedIds.has(message.id) &&
                  message.id !== activeRevealId;
                // Hold later assistant bubbles until the previous one finishes typing.
                if (isPendingFresh) return null;
                return (
                  <BuilderBubble
                    key={message.id}
                    message={message}
                    agentId={agentId}
                    resolvedFormIds={resolvedFormIds}
                    formSuperseded={isFormSuperseded(message)}
                    fixResolved={fixedMessageIds.has(message.id)}
                    isFresh={isFresh}
                    animateNow={
                      message.role === "assistant" && message.id === activeRevealId
                    }
                    activityLines={
                      (message.card === "thinking" || message.card === "build_progress") &&
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
                    onSuggestion={(prompt) => setPrefill(prompt)}
                  />
                );
              })}
              {showLocalWorking ? (
                <MessageEntrance active>
                  <BuilderWorkingPanel
                    operations={workingOperations}
                    activityLines={activityLines}
                  />
                </MessageEntrance>
              ) : null}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 px-4 pb-5">
        <PromptComposer
          key={prefill}
          className="mx-auto max-w-3xl"
          placeholder={t("builder:composer.placeholder")}
          onSubmit={(value) => void handleSend(value)}
          onStop={handleStop}
          busy={composerBusy}
          busyLabel={t("common:composer.working")}
          autoFocus={messages.length === 0}
          initialValue={prefill}
        />
      </div>
    </div>
  );
}
