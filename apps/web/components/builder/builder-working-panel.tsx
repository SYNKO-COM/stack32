"use client";

import { useEffect, useState } from "react";

import {
  BuilderActivityFeed,
  type ActivityLine,
} from "@/components/builder/builder-activity-feed";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

const FALLBACK_KEYS = [
  "reading",
  "understanding",
  "draftingIdentity",
  "mappingCapabilities",
  "preparingStructure",
] as const;

/** A real operational step emitted by the Builder (event + state). */
export interface BuilderOperation {
  event: string;
  state: "done" | "running" | "pending";
  detail?: string;
}

/**
 * Live “builder is working” panel — Cursor-style activity feed.
 * Prefers `activityLines` / `operations`; otherwise rotates fallback labels.
 */
export function BuilderWorkingPanel({
  className,
  operations,
  activityLines,
}: {
  className?: string;
  operations?: BuilderOperation[];
  activityLines?: ActivityLine[];
}) {
  const { t } = useTranslation("builder");
  const [index, setIndex] = useState(0);
  const hasFeed = Boolean(activityLines && activityLines.length > 0);
  const hasOps = Boolean(operations && operations.length > 0);

  useEffect(() => {
    if (hasFeed || hasOps) return;
    const id = window.setInterval(() => {
      setIndex((prev) => {
        const next = Math.min(prev + 1, FALLBACK_KEYS.length - 1);
        // #region agent log
        fetch('http://127.0.0.1:7857/ingest/1ac9df66-3a30-4b3a-a8c1-bbbdaf39db81',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'faa28e'},body:JSON.stringify({sessionId:'faa28e',hypothesisId:'A',location:'builder-working-panel.tsx:fallbackTick',message:'fallback activity tick',data:{prev,next,capped:next===FALLBACK_KEYS.length-1,hasFeed,hasOps},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        return next;
      });
    }, 2800);
    return () => window.clearInterval(id);
  }, [hasFeed, hasOps]);

  let lines: ActivityLine[] = [];
  if (hasFeed) {
    lines = activityLines!;
  } else if (hasOps) {
    lines = operations!
      .filter((op) => op.state !== "pending")
      .map((op, i) => ({
        id: `${op.event}-${i}`,
        text: t(`working.operations.${op.event}`, {
          defaultValue: op.detail ?? op.event,
        }),
        active: op.state === "running",
      }));
    if (!lines.some((l) => l.active)) {
      lines = [...lines, { id: "planning", text: t("working.planning"), active: true }];
    }
  } else {
    lines = FALLBACK_KEYS.slice(0, index + 1).map((key, i) => ({
      id: key,
      text: t(`working.activities.${key}`),
      active: i === index,
    }));
    lines = [
      ...lines.filter((l) => !l.active),
      { id: "planning", text: t("working.planning"), active: true },
    ];
  }

  return (
    <div className={cn(className)}>
      <BuilderActivityFeed lines={lines} />
    </div>
  );
}
