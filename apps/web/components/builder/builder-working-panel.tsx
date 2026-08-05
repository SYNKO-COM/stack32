"use client";

import { useEffect, useState } from "react";

import { LogoMark } from "@/components/shared/logo";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

const ACTIVITY_KEYS = [
  "reading",
  "understanding",
  "draftingIdentity",
  "mappingCapabilities",
  "preparingStructure",
] as const;

/**
 * Live “builder is working” panel — shown while waiting for the first
 * assistant response or while a long server turn is still in flight.
 */
export function BuilderWorkingPanel({ className }: { className?: string }) {
  const { t } = useTranslation("builder");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % ACTIVITY_KEYS.length);
    }, 1600);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className={cn("flex gap-3", className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="glass mt-1 flex size-7 shrink-0 items-center justify-center rounded-full">
        <LogoMark className="size-4 animate-pulse" />
      </span>
      <div className="max-w-[90%] sm:max-w-[80%]">
        <p className="mb-1 font-mono text-[11px] text-muted-foreground/60">
          {t("builderName")}
        </p>
        <div className="glass overflow-hidden rounded-3xl border border-brand/25 bg-gradient-to-br from-brand/[0.08] via-transparent to-emerald-500/[0.05] px-4 py-3.5">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand/70 opacity-70" />
              <span className="relative inline-flex size-2.5 rounded-full bg-brand" />
            </span>
            <p className="text-sm font-medium text-foreground/90">{t("working.title")}</p>
            <span className="ml-auto flex gap-1" aria-hidden="true">
              <span className="size-1.5 animate-bounce rounded-full bg-brand/80 [animation-delay:0ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-brand/80 [animation-delay:150ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-brand/80 [animation-delay:300ms]" />
            </span>
          </div>

          <ul className="space-y-2.5">
            {ACTIVITY_KEYS.map((key, i) => {
              const state =
                i < index ? "done" : i === index ? "running" : "pending";
              return (
                <li
                  key={key}
                  className={cn(
                    "flex items-center gap-2.5 text-sm transition-all duration-500",
                    state === "pending" && "translate-x-0 opacity-35",
                    state === "running" && "translate-x-0.5 opacity-100",
                    state === "done" && "opacity-65",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-lg border transition-colors",
                      state === "done" && "border-emerald-400/40 bg-emerald-400/15",
                      state === "running" &&
                        "border-brand/50 bg-brand/15 shadow-[0_0_16px_-6px_rgba(249,115,22,0.7)]",
                      state === "pending" && "border-border/60 bg-background/20",
                    )}
                  >
                    {state === "running" ? (
                      <span className="size-1.5 animate-pulse rounded-full bg-brand" />
                    ) : state === "done" ? (
                      <span className="size-1.5 rounded-full bg-emerald-400" />
                    ) : (
                      <span className="size-1 rounded-full bg-muted-foreground/40" />
                    )}
                  </span>
                  <span
                    className={cn(
                      state === "running"
                        ? "font-medium text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {t(`working.activities.${key}`)}
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="mt-3.5 text-xs text-muted-foreground">{t("working.hint")}</p>
        </div>
      </div>
    </div>
  );
}
