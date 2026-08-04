"use client";

import { ExternalLink, Loader2, Table2, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { AgentIcon } from "@/components/builder/agent-icon";
import { Markdown } from "@/components/shared/markdown";
import { PromptComposer } from "@/components/shared/prompt-composer";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAgent, useAgentSpec } from "@/hooks/use-agents";
import { useCurrentUser } from "@/hooks/use-auth";
import { useClearLiveThread, useLiveThread, useSendLiveMessage } from "@/hooks/use-live";
import { useTranslation } from "@/hooks/use-translation";
import type { LiveMessage } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

function LiveBubble({ message, agentIcon }: { message: LiveMessage; agentIcon: string }) {
  const { t, i18n } = useTranslation("live");
  const { data: user } = useCurrentUser();
  const isUser = message.role === "user";

  const time = new Intl.DateTimeFormat(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(message.createdAt));

  if (message.pending) {
    return (
      <div className="flex gap-3">
        <AgentIcon icon={agentIcon} className="mt-1 size-7 rounded-full" />
        <div
          className="glass flex items-center gap-2.5 rounded-3xl px-4 py-3 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-4 animate-spin text-brand" aria-hidden="true" />
          {message.statusKey ? t(`status.${message.statusKey}`) : t("status.preparing")}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      {isUser ? (
        <Avatar className="mt-1 size-7 shrink-0">
          <AvatarFallback className="bg-brand/30 text-xs">
            {(user?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      ) : (
        <AgentIcon icon={agentIcon} className="mt-1 size-7 rounded-full" />
      )}

      <div className={cn("max-w-[85%] sm:max-w-[75%]", isUser && "text-right")}>
        <p className="mb-1 font-mono text-[11px] text-muted-foreground/60">{time}</p>
        <div
          className={cn(
            "rounded-3xl px-4 py-3 text-left text-sm leading-relaxed",
            isUser ? "bg-brand/15" : "glass",
          )}
        >
          {/* Controlled notices (e.g. execution disabled) reference i18n keys. */}
          <Markdown
            content={message.content.startsWith("live:") ? t(message.content.replace(/^live:/, "")) : message.content}
          />

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
      </div>
    </div>
  );
}

export function LiveView({ agentId }: { agentId: string }) {
  const { t } = useTranslation(["live", "builder"]);
  const { data: agent } = useAgent(agentId);
  const { data: spec } = useAgentSpec(agentId);
  const { data: thread } = useLiveThread(agentId);
  const sendMessage = useSendLiveMessage(agentId);
  const clearThread = useClearLiveThread(agentId);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = thread?.messages ?? [];
  const busy = messages.some((m) => m.pending);
  const agentName = agent?.name || t("builder:sidebar.untitledAgent");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {agent ? <AgentIcon icon={agent.icon} /> : null}
          <h1 className="truncate text-sm font-medium">{agentName}</h1>
          <Badge
            variant="outline"
            className={cn(
              "border-border text-xs",
              agent?.status === "published" ? "text-sky-300" : "text-zinc-300",
            )}
          >
            {agent?.status === "published" ? t("live:badge.published") : t("live:badge.draft")}
          </Badge>
        </div>
        {messages.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => void clearThread.mutateAsync()}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            {t("live:actions.clear")}
          </Button>
        ) : null}
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
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
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
              <LiveBubble key={message.id} message={message} agentIcon={agent?.icon ?? "bot"} />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 px-4 pb-5">
        <PromptComposer
          className="mx-auto max-w-3xl"
          placeholder={t("live:composer.placeholder")}
          onSubmit={(value) => void sendMessage.mutateAsync(value)}
          busy={busy}
        />
      </div>
    </div>
  );
}
