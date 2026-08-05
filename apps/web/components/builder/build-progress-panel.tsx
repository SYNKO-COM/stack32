"use client";

import { Check, CircleX, Loader2 } from "lucide-react";

import { useTranslation } from "@/hooks/use-translation";
import type { BuildStep, BuildStepState } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

function StateIcon({ state }: { state: BuildStepState }) {
  if (state === "done") {
    return <Check className="size-3.5 text-emerald-400" aria-hidden="true" />;
  }
  if (state === "running") {
    return <Loader2 className="size-3.5 animate-spin text-brand" aria-hidden="true" />;
  }
  if (state === "failed") {
    return <CircleX className="size-3.5 text-destructive" aria-hidden="true" />;
  }
  return <span className="size-3.5 rounded-full border border-border/80" aria-hidden="true" />;
}

/** Simple step list only — no large visual board. */
export function BuildProgressPanel({
  steps,
  focus,
}: {
  steps?: BuildStep[];
  board?: unknown;
  focus?: string;
}) {
  const { t } = useTranslation("builder");

  return (
    <div className="space-y-3">
      {focus ? (
        <p className="flex items-center gap-2 text-sm text-foreground/80">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand/60 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-brand" />
          </span>
          {focus}
        </p>
      ) : null}

      {steps && steps.length > 0 ? (
        <ol className="space-y-2" aria-live="polite">
          {steps.map((step) => (
            <li key={step.labelKey} className="flex items-center gap-2.5 text-sm">
              <StateIcon state={step.state} />
              <span
                className={cn(
                  step.state === "pending" ? "text-muted-foreground/60" : "text-foreground/85",
                  step.state === "running" && "font-medium text-foreground",
                  step.state === "failed" && "text-destructive",
                )}
              >
                {t(`steps.${step.labelKey}`)}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
