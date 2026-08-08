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
import { MessageEntrance, TypewriterText } from "@/components/builder/message-motion";
import { IdentityConfirmedMessage, ReadyCard } from "@/components/builder/ready-card";
import { SecretForm } from "@/components/builder/secret-form";
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
  useRepairAgent,
  useSendBuilderMessage,
} from "@/hooks/use-builder";
import { summarizeActivity, useRunActivity } from "@/hooks/use-run-activity";
import { useTranslation } from "@/hooks/use-translation";
import { playAgentReadyChime } from "@/lib/audio/agent-ready-chime";
import type { BuilderAction, BuilderMessage } from "@/lib/domain/types";
import { consumePendingPrompt, consumePrefillDraft } from "@/lib/pending-prompt";
import { cn } from "@/lib/utils";
import type { BuilderOperation } from "@/components/builder/builder-working-panel";

function MessageActions({
  actions,
  agentId,
  onFix,
}: {
  actions: BuilderAction[];
  agentId: string;
  onFix: () => void;
}) {
  const { t } = useTranslation("builder");
  const router = useRouter();

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {actions.map((action) => {
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
        if (action === "view_structure" || action === "view_changes") {
          return null;
        }
        return (
          <Button
            key={action}
            size="sm"
            variant="secondary"
            className="rounded-full"
            onClick={onFix}
          >
            {t("actions.fixAutomatically")}
          </Button>
        );
      })}
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
  isFresh,
  animateNow,
  onRevealDone,
  activityLines,
}: {
  message: BuilderMessage;
  agentId: string;
  onFix: () => void;
  onFormSubmitted?: (requestId: string) => void;
  onSuggestion?: (prompt: string) => void;
  resolvedFormIds: Set<string>;
  /** True when a later message exists — the user already answered this form. */
  formSuperseded?: boolean;
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
    content = t(contentKey, { defaultValue: contentKey.replace(/^builder:/, "") });
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
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-300">
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
                        className="rounded-md bg-foreground/[0.05] px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
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

            {!showReady && message.actions && message.actions.length > 0 ? (
              <MessageActions actions={message.actions} agentId={agentId} onFix={onFix} />
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
  const { data: thread } = useBuilderThread(agentId, {
    forcePoll: busy || awaitingReply,
  });
  const sendMessage = useSendBuilderMessage(agentId);
  const cancelRun = useCancelBuilderRun(agentId);
  const repair = useRepairAgent(agentId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bootstrappedRef = useRef(false);
  const celebratedIdsRef = useRef<Set<string>>(new Set());
  /** Epoch ms of the in-flight send — survives stale refetches & duplicate prompt text. */
  const [pendingToken, setPendingToken] = useState<number | null>(null);
  const [prefill, setPrefill] = useState("");
  const [resolvedFormIds, setResolvedFormIds] = useState<Set<string>>(() => new Set());
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
        if (stoppedRunIdsRef.current.has(m.interruptRunId ?? "")) return false;
        return !later.some((x) => x.role === "assistant");
      }
      if (m.card === "build_progress") {
        if (isCanceledProgress(m)) return false;
        // Hide as soon as any later assistant reply exists (result, cancel, form, …).
        return !later.some(
          (x) => x.role === "assistant" && x.card !== "thinking",
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
      repair.isPending ||
      busy ||
      Boolean(liveProgress) ||
      turnMessages.some((m) => m.card === "thinking"));
  const { data: runEvents = [] } = useRunActivity(activeRunId, activityEnabled);
  const activityLines = summarizeActivity(runEvents).lines.map((line) => {
    const text = t(`builder:activity.${line.key}`, {
      ...(line.params ?? {}),
      defaultValue: line.key,
    });
    return {
      id: line.id,
      text: text.charAt(0).toUpperCase() + text.slice(1),
      active: line.active,
    };
  });


  const lastMessage = visibleMessages.at(-1) ?? messages.at(-1);
  const lastIsUser = lastMessage?.role === "user";
  const lastIsThinking = lastMessage?.card === "thinking";
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
    !waitingOnForm &&
    !lastIsThinking &&
    lastMessage?.card !== "build_progress" &&
    (awaitingReply ||
      pendingToken !== null ||
      sendMessage.isPending ||
      repair.isPending ||
      (busy && lastIsUser));
  // Keep Stop available for the whole in-flight turn (not only while awaitingReply).
  const composerBusy =
    !waitingOnForm &&
    (awaitingReply ||
      pendingToken !== null ||
      sendMessage.isPending ||
      repair.isPending ||
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
    setPendingToken(null);
    setAwaitingReply(false);
    void cancelRun.mutateAsync();
  };

  const lastFocus = messages.at(-1)?.focus;
  const lastSteps = messages.at(-1)?.steps;

  // Clear waiting only for a final reply after a user message from *this* send window.
  useEffect(() => {
    if (pendingToken === null) return;
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
    // Stale refetch without our user row — keep waiting.
    if (anchorIdx < 0) return;
    const hasFinal = messages.slice(anchorIdx + 1).some(
      (m) =>
        m.role === "assistant" &&
        m.card !== "thinking" &&
        m.card !== "build_progress" &&
        Boolean(m.uiComponent || m.card || m.content),
    );
    if (!hasFinal) return;
    setPendingToken(null);
    setAwaitingReply(false);
  }, [messages, pendingToken]);


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

  const refreshAfterForm = (requestId: string) => {
    if (requestId) {
      setResolvedFormIds((prev) => new Set(prev).add(requestId));
    }
    setAwaitingReply(true);
    void queryClient.invalidateQueries({ queryKey: ["builder", agentId] });
    void queryClient.invalidateQueries({ queryKey: ["agents"] });
  };

  const examples = [
    "Create an agent that researches a company, scores the lead and drafts a personalized email.",
  ];

  const handleSend = async (value: string) => {
    const token = Date.now();
    setPendingToken(token);
    setAwaitingReply(true);
    try {
      await sendMessage.mutateAsync(value);
    } catch {
      setPendingToken(null);
      setAwaitingReply(false);
    }
  };

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
                      setAwaitingReply(true);
                      void repair.mutateAsync();
                    }}
                    onFormSubmitted={(requestId) => {
                      refreshAfterForm(requestId);
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
