"use client";

import type { AgentStatus } from "@/lib/domain/types";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<AgentStatus, { dot: string; text: string }> = {
  draft: { dot: "bg-zinc-400", text: "text-muted-foreground" },
  building: { dot: "bg-brand animate-pulse", text: "text-brand" },
  ready: { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
  needs_attention: { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
  published: { dot: "bg-sky-500", text: "text-sky-700 dark:text-sky-300" },
  waiting_for_input: { dot: "bg-amber-500 animate-pulse", text: "text-amber-700 dark:text-amber-300" },
  needs_setup: { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
  archived: { dot: "bg-zinc-400", text: "text-muted-foreground" },
};

const STATUS_KEYS: Record<AgentStatus, string> = {
  draft: "status.draft",
  building: "status.building",
  ready: "status.ready",
  needs_attention: "status.needsAttention",
  published: "status.published",
  waiting_for_input: "status.waitingForInput",
  needs_setup: "status.needsSetup",
  archived: "status.archived",
};

interface StatusBadgeProps {
  status: AgentStatus;
  /** dot — colored dot only; full — dot + label chip. */
  mode?: "dot" | "full";
  className?: string;
}

export function StatusBadge({ status, mode = "full", className }: StatusBadgeProps) {
  const { t } = useTranslation("common");
  const style = STATUS_STYLES[status];
  const label = t(STATUS_KEYS[status]);

  if (mode === "dot") {
    return (
      <span
        className={cn("inline-block size-2 shrink-0 rounded-full", style.dot, className)}
        role="status"
        aria-label={label}
        title={label}
      />
    );
  }

  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-foreground/[0.03] px-2.5 py-0.5 text-xs font-medium",
        style.text,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot)} aria-hidden="true" />
      {label}
    </span>
  );
}
