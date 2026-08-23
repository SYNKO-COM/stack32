"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";

import { LogoMark } from "@/components/shared/logo";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

export type ActivityKind = "read" | "write" | "exec" | "think" | "milestone" | "error";

export type ActivityLine = {
  id: string;
  text: string;
  active?: boolean;
  kind?: ActivityKind;
};

/** How many finished steps stay visible above the current one. */
const VISIBLE_HISTORY = 2;

const KIND_DOT: Record<ActivityKind, string> = {
  read: "bg-sky-400/70",
  write: "bg-brand",
  exec: "bg-violet-400/80",
  think: "bg-muted-foreground/50",
  milestone: "bg-emerald-400/80",
  error: "bg-amber-500",
};

function Dot({ kind, active }: { kind: ActivityKind; active: boolean }) {
  const color = KIND_DOT[kind] ?? KIND_DOT.think;
  if (!active) {
    return <span className={cn("mt-[7px] size-1.5 shrink-0 rounded-full opacity-50", color)} />;
  }
  return (
    <span className="relative mt-[7px] flex size-1.5 shrink-0">
      <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-70", color)} />
      <span className={cn("relative inline-flex size-1.5 rounded-full", color)} />
    </span>
  );
}

/**
 * Live activity feed for a running agent.
 *
 * Previously every step was appended to one growing list, so a build ended as a
 * wall of twenty checked-off lines and the eye had nowhere to rest. Now the
 * current step leads, the two before it recede, and older ones roll out — the
 * feed reads as an agent working rather than a checklist filling up. The whole
 * run stays available behind the step counter, so nothing is actually lost.
 */
export function BuilderActivityFeed({
  lines,
  className,
  showHeader = true,
}: {
  lines: ActivityLine[];
  className?: string;
  showHeader?: boolean;
}) {
  const { t } = useTranslation("builder");
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useReducedMotion();

  const display = useMemo(
    () =>
      lines.length > 0
        ? lines
        : [{ id: "pending", text: t("working.planning"), active: true, kind: "think" as const }],
    [lines, t],
  );

  const windowed = expanded ? display : display.slice(-(VISIBLE_HISTORY + 1));
  const hidden = display.length - windowed.length;
  const running = display.some((l) => l.active);

  return (
    <div
      className={cn("flex gap-3", className)}
      role="status"
      aria-live="polite"
      aria-busy={running}
    >
      {showHeader ? (
        <span className="glass mt-1 flex size-7 shrink-0 items-center justify-center rounded-full">
          <LogoMark className={cn("size-4", running && "animate-pulse")} />
        </span>
      ) : null}

      <div className={cn("min-w-0", showHeader && "max-w-[90%] sm:max-w-[80%]")}>
        {showHeader ? (
          <p className="mb-1 font-mono text-[11px] text-muted-foreground/60">
            {t("builderName")}
          </p>
        ) : null}

        {hidden > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mb-1 font-mono text-[11px] text-muted-foreground/50 transition-colors hover:text-muted-foreground"
          >
            {t("activity.moreSteps", { count: hidden })}
          </button>
        ) : null}

        {/* Screen readers get the full run; the animation is purely visual. */}
        <ul className="space-y-1.5">
          <AnimatePresence initial={false} mode="popLayout">
            {windowed.map((line, index) => {
              const depth = windowed.length - 1 - index;
              const faded = !line.active && !expanded;
              return (
                <motion.li
                  key={line.id}
                  layout={!reduceMotion}
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{
                    opacity: line.active ? 1 : faded ? Math.max(0.28, 0.62 - depth * 0.16) : 0.7,
                    y: 0,
                  }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                  transition={{ duration: reduceMotion ? 0 : 0.28, ease: "easeOut" }}
                  className={cn(
                    "flex items-start gap-2 text-sm",
                    line.active ? "font-medium text-foreground/90" : "text-muted-foreground/70",
                  )}
                >
                  <Dot kind={line.kind ?? "think"} active={Boolean(line.active)} />
                  <span className="min-w-0 break-words">{line.text}</span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>

        {expanded && display.length > VISIBLE_HISTORY + 1 ? (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mt-1 font-mono text-[11px] text-muted-foreground/50 transition-colors hover:text-muted-foreground"
          >
            {t("activity.collapse")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
