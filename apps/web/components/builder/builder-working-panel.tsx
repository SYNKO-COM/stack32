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

const STAGE_KEY_PREFIX = "stack32.builderWorkingStage:";

/** A real operational step emitted by the Builder (event + state). */
export interface BuilderOperation {
  event: string;
  state: "done" | "running" | "pending";
  detail?: string;
}

function readPersistedStage(storageKey: string | undefined): number {
  if (!storageKey || typeof window === "undefined") return 0;
  try {
    const raw = window.sessionStorage.getItem(`${STAGE_KEY_PREFIX}${storageKey}`);
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(FALLBACK_KEYS.length - 1, Math.floor(n)));
  } catch {
    return 0;
  }
}

function writePersistedStage(storageKey: string | undefined, index: number): void {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${STAGE_KEY_PREFIX}${storageKey}`, String(index));
  } catch {
    // ignore
  }
}

/**
 * Live “builder is working” panel — Cursor-style activity feed.
 * Prefers `activityLines` / `operations`; otherwise rotates fallback labels.
 * Stage is persisted per agent so refresh / navigation resumes where it left off
 * (never replays completed fake steps from zero).
 */
export function BuilderWorkingPanel({
  className,
  operations,
  activityLines,
  persistKey,
  /** True when we already know a build run is in flight — skip theatrical cascade. */
  resumeMode = false,
}: {
  className?: string;
  operations?: BuilderOperation[];
  activityLines?: ActivityLine[];
  /** Agent id (or run id) — keeps fallback progress across remounts. */
  persistKey?: string;
  resumeMode?: boolean;
}) {
  const { t } = useTranslation("builder");
  const [index, setIndex] = useState(() => readPersistedStage(persistKey));
  const hasFeed = Boolean(activityLines && activityLines.length > 0);
  const hasOps = Boolean(operations && operations.length > 0);

  useEffect(() => {
    setIndex(readPersistedStage(persistKey));
  }, [persistKey]);

  useEffect(() => {
    // Real server events / ops own the feed — do not animate a parallel story.
    if (hasFeed || hasOps || resumeMode) return;
    const id = window.setInterval(() => {
      setIndex((prev) => {
        const next = Math.min(prev + 1, FALLBACK_KEYS.length - 1);
        writePersistedStage(persistKey, next);
        return next;
      });
    }, 2800);
    return () => window.clearInterval(id);
  }, [hasFeed, hasOps, persistKey, resumeMode]);

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
      // All ops finished — keep them visible as done, do not fake an active step.
      lines = lines.map((line) => ({ ...line, active: false }));
    }
  } else if (resumeMode) {
    // Refresh mid-build before events hydrate: show prior steps as done, no cascade replay.
    const doneThrough = Math.max(index, 0);
    lines = FALLBACK_KEYS.slice(0, doneThrough + 1).map((key) => ({
      id: key,
      text: t(`working.activities.${key}`),
      active: false,
    }));
    lines = [...lines, { id: "planning", text: t("working.planning"), active: true }];
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

  // Never show a lonely "planning" row with nothing real behind it when the panel
  // was mounted after a cancel / idle agent — parent should hide us, but belt & braces.
  if (lines.length === 1 && lines[0]?.id === "planning" && !hasFeed && !hasOps) {
    lines = [];
  }

  return (
    <div className={cn(className)}>
      <BuilderActivityFeed lines={lines} />
    </div>
  );
}
