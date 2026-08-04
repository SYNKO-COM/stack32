"use client";

import { AlertTriangle, Check, CircleX, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { LogoMark } from "@/components/shared/logo";
import { Markdown } from "@/components/shared/markdown";
import { PromptComposer } from "@/components/shared/prompt-composer";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAgent } from "@/hooks/use-agents";
import { useCurrentUser } from "@/hooks/use-auth";
import { useBuilderThread, useRepairAgent, useSendBuilderMessage } from "@/hooks/use-builder";
import { useTranslation } from "@/hooks/use-translation";
import type { BuilderAction, BuilderMessage, BuildStep } from "@/lib/domain/types";
import { consumePendingPrompt, consumePrefillDraft } from "@/lib/pending-prompt";
import { cn } from "@/lib/utils";

function StepList({ steps }: { steps: BuildStep[] }) {
  const { t } = useTranslation("builder");

  return (
    <ol className="space-y-2" aria-live="polite">
      {steps.map((step) => (
        <li key={step.labelKey} className="flex items-center gap-2.5 text-sm">
          {step.state === "done" ? (
            <Check className="size-4 text-emerald-400" aria-hidden="true" />
          ) : step.state === "running" ? (
            <Loader2 className="size-4 animate-spin text-brand" aria-hidden="true" />
          ) : step.state === "failed" ? (
            <CircleX className="size-4 text-destructive" aria-hidden="true" />
          ) : (
            <span className="size-4 rounded-full border border-border" aria-hidden="true" />
          )}
          <span
            className={cn(
              step.state === "pending" ? "text-muted-foreground/60" : "text-foreground/85",
            )}
          >
            {t(`steps.${step.labelKey}`)}
          </span>
        </li>
      ))}
    </ol>
  );
}

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
              onClick={() => router.push(`/agents/${agentId}/live`)}
            >
              {t("actions.testAgent")}
            </Button>
          );
        }
        if (action === "view_structure") {
          return (
            <Button
              key={action}
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => router.push(`/agents/${agentId}/structure`)}
            >
              {t("actions.viewStructure")}
            </Button>
          );
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
}: {
  message: BuilderMessage;
  agentId: string;
  onFix: () => void;
}) {
  const { t, i18n } = useTranslation(["builder", "common"]);
  const { data: user } = useCurrentUser();
  const isUser = message.role === "user";

  // Assistant mock responses reference i18n keys so they localize live.
  const content = message.content.startsWith("builder:")
    ? t(message.content)
    : message.content;

  const time = new Intl.DateTimeFormat(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(message.createdAt));

  return (
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

      <div className={cn("max-w-[85%] sm:max-w-[75%]", isUser && "text-right")}>
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
            "rounded-3xl px-4 py-3 text-left text-sm leading-relaxed",
            isUser
              ? "bg-brand/15 text-foreground"
              : "glass text-foreground/90",
            message.tone === "error" && "border border-destructive/40",
            message.tone === "warning" && "border border-amber-400/40",
            message.tone === "success" && "border border-emerald-400/20",
          )}
        >
          {message.tone === "error" ? (
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-destructive">
              <CircleX className="size-3.5" aria-hidden="true" />
              {t("common:status.needsAttention")}
            </p>
          ) : null}
          {message.tone === "warning" ? (
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-300">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              {t("common:status.needsAttention")}
            </p>
          ) : null}

          {message.steps && message.steps.length > 0 ? (
            <div className={cn(content && "mb-3")}>
              <StepList steps={message.steps} />
            </div>
          ) : null}

          {content ? <Markdown content={content} /> : null}

          {message.actions && message.actions.length > 0 ? (
            <MessageActions actions={message.actions} agentId={agentId} onFix={onFix} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function BuildView({ agentId }: { agentId: string }) {
  const { t } = useTranslation(["builder", "common"]);
  const { data: agent } = useAgent(agentId);
  const { data: thread } = useBuilderThread(agentId);
  const sendMessage = useSendBuilderMessage(agentId);
  const repair = useRepairAgent(agentId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const bootstrappedRef = useRef(false);
  const [prefill, setPrefill] = useState("");

  const messages = thread?.messages ?? [];
  const busy = agent?.status === "building";

  // Consume the landing-page pending prompt exactly once, on an empty thread.
  useEffect(() => {
    if (!thread || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    if (thread.messages.length === 0) {
      const pending = consumePendingPrompt();
      if (pending) {
        void sendMessage.mutateAsync(pending);
        return;
      }
    }
    const draft = consumePrefillDraft();
    if (draft) {
      const timeout = setTimeout(() => setPrefill(draft), 0);
      return () => clearTimeout(timeout);
    }
  }, [thread, sendMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  const examples = [
    "Create an agent that researches a company, scores the lead and drafts a personalized email.",
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4"
        role="log"
        aria-label={t("builder:a11y.conversation")}
        aria-live="polite"
      >
        <div className="mx-auto max-w-3xl space-y-6 py-8">
          {messages.length === 0 ? (
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
                onClick={() => void sendMessage.mutateAsync(examples[0])}
              >
                “{examples[0]}”
              </button>
            </div>
          ) : (
            messages.map((message) => (
              <BuilderBubble
                key={message.id}
                message={message}
                agentId={agentId}
                onFix={() => void repair.mutateAsync()}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 px-4 pb-5">
        <PromptComposer
          key={prefill}
          className="mx-auto max-w-3xl"
          placeholder={t("builder:composer.placeholder")}
          onSubmit={(value) => void sendMessage.mutateAsync(value)}
          busy={busy}
          autoFocus={messages.length === 0}
          initialValue={prefill}
        />
      </div>
    </div>
  );
}
