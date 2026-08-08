"use client";

import { LogoMark } from "@/components/shared/logo";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

export type ActivityLine = {
  id: string;
  text: string;
  active?: boolean;
};

/**
 * Cursor-style live activity feed (muted done lines + current “Planning…” beat).
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
  const display =
    lines.length > 0
      ? lines
      : [{ id: "pending", text: t("working.planning"), active: true }];

  return (
    <div
      className={cn("flex gap-3", className)}
      role="status"
      aria-live="polite"
      aria-busy={display.some((l) => l.active)}
    >
      {showHeader ? (
        <span className="glass mt-1 flex size-7 shrink-0 items-center justify-center rounded-full">
          <LogoMark className="size-4 animate-pulse" />
        </span>
      ) : null}
      <div className={cn(showHeader && "max-w-[90%] sm:max-w-[80%]")}>
        {showHeader ? (
          <p className="mb-1 font-mono text-[11px] text-muted-foreground/60">
            {t("builderName")}
          </p>
        ) : null}
        <ul className="space-y-1.5">
          {display.map((line) => (
            <li
              key={line.id}
              className={cn(
                "text-sm transition-opacity duration-300",
                line.active
                  ? "font-medium text-foreground/90"
                  : "text-muted-foreground/70",
              )}
            >
              {line.active ? (
                <span className="inline-flex items-center gap-2">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand/70 opacity-70" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-brand" />
                  </span>
                  {line.text}
                </span>
              ) : (
                line.text
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
