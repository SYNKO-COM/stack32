"use client";

import { BuilderActivityFeed, type ActivityLine } from "@/components/builder/builder-activity-feed";
import { useTranslation } from "@/hooks/use-translation";
import type { BuildStep } from "@/lib/domain/types";

/** Live build progress — Cursor-style activity lines from steps + optional feed. */
export function BuildProgressPanel({
  steps,
  activityLines,
}: {
  steps?: BuildStep[];
  board?: unknown;
  focus?: string;
  activityLines?: ActivityLine[];
}) {
  const { t } = useTranslation("builder");

  const fromSteps: ActivityLine[] =
    activityLines && activityLines.length > 0
      ? activityLines
      : (steps ?? [])
          .map((step, i): ActivityLine | null => {
            const running = step.state === "running";
            const done = step.state === "done" || step.state === "failed";
            if (!done && !running) return null;
            return {
              id: `${step.labelKey}-${i}`,
              text: t(`steps.${step.labelKey}`),
              active: running,
            };
          })
          .filter((line): line is ActivityLine => line !== null);

  // Always keep a trailing “Planning next moves” while something is still running.
  const stillRunning = (steps ?? []).some((s) => s.state === "running" || s.state === "pending");
  const lines =
    stillRunning && !fromSteps.some((l) => l.active)
      ? [...fromSteps, { id: "planning", text: t("working.planning"), active: true }]
      : fromSteps.length > 0
        ? fromSteps
        : [{ id: "planning", text: t("working.planning"), active: true }];

  return <BuilderActivityFeed lines={lines} showHeader={false} />;
}
