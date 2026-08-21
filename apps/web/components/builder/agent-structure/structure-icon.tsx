"use client";

import { Check, Clock, Loader2, Pause, Send, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";

import { getCachedIntegrationIcon } from "@/lib/integrations/icon-resolver";
import { cn } from "@/lib/utils";

/** Visual tone for structure nodes (idle = orange, not green). */
export type StructureTone = "orange" | "green" | "amber" | "red";

export const STRUCTURE_COLORS = {
  orange: { inner: "#fedbb4", icon: "#fa8908", border: "var(--structure-node-border)" },
  green: { inner: "#c8e2bd", icon: "#50d835", border: "#50d835" },
  amber: { inner: "#ffeeb2", icon: "#ffc701", border: "#ffc701" },
  /** Icon red — user listed #ffc701 twice for red; mockups use dark red. */
  red: { inner: "#efb0af", icon: "#e53935", border: "#e53935" },
} as const;

export function statusToTone(status: string): StructureTone {
  switch (status) {
    case "error":
    case "broken":
      return "red";
    case "setup_required":
    case "waiting_for_connection":
    case "waiting_for_approval":
      return "amber";
    case "success":
      return "green";
    case "running":
    case "queued":
      return "orange";
    case "ready":
    case "idle":
    default:
      return "orange";
  }
}

export function statusShowsWarning(status: string): boolean {
  return status === "setup_required";
}

export function statusShowsPause(status: string): boolean {
  return status === "waiting_for_connection" || status === "waiting_for_approval";
}

export function statusShowsSpinner(status: string): boolean {
  return status === "running" || status === "queued";
}

export function statusShowsCheck(status: string): boolean {
  return status === "success";
}

export function statusShowsError(status: string): boolean {
  return status === "error" || status === "broken";
}

/** Outer border color for the node shell. Idle uses the theme token; status colors stay. */
export function toneBorderColor(tone: StructureTone, status: string): string {
  if (statusShowsPause(status) || statusShowsWarning(status)) return STRUCTURE_COLORS.amber.border;
  if (statusShowsSpinner(status)) return STRUCTURE_COLORS.orange.icon;
  if (statusShowsCheck(status)) return STRUCTURE_COLORS.green.border;
  if (statusShowsError(status)) return STRUCTURE_COLORS.red.border;
  return STRUCTURE_COLORS.orange.border;
}

const KIND_SLOT: Record<string, string> = {
  trigger_chat: "chat",
  trigger_schedule: "schedule",
  trigger_tool: "tool-trigger",
  agent: "agent",
  memory: "memory",
  model: "model",
  output: "output",
};

function kindIconSrc(tone: StructureTone, slot: string): string {
  return `/structure-icons/${tone}/${slot}.png`;
}

function ringSrc(tone: StructureTone): string {
  return `/structure-icons/rings/${tone}.png`;
}

function StatusBadge({ status }: { status: string }) {
  if (statusShowsPause(status)) {
    return (
      <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-amber-400 text-white shadow-sm">
        <Pause className="size-3" fill="currentColor" strokeWidth={0} aria-hidden />
      </span>
    );
  }
  if (statusShowsSpinner(status)) {
    return (
      <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-white shadow-sm">
        <Loader2 className="size-3.5 animate-spin text-[#fa8908]" aria-hidden />
      </span>
    );
  }
  if (statusShowsCheck(status)) {
    return (
      <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-[#50d835] text-white shadow-sm">
        <Check className="size-3" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (statusShowsError(status)) {
    return (
      <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-[#e53935] text-white shadow-sm">
        <X className="size-3" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  return null;
}

/** System kind icon (chat / agent / memory / model / output) — full colored asset. */
export function StructureKindIcon({
  kind,
  status,
  className,
}: {
  kind: string;
  status: string;
  className?: string;
}) {
  const tone = statusToTone(status);
  const slot = KIND_SLOT[kind] ?? "agent";
  // Compose ring + glyph when we have no dedicated PNG for that slot/tone.
  const composeGlyph =
    slot === "schedule" || slot === "tool-trigger" || (slot === "output" && tone === "orange");
  const Glyph = slot === "tool-trigger" ? Zap : slot === "schedule" ? Clock : Send;

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {composeGlyph ? (
        <span className="relative flex size-full items-center justify-center">
          <img
            src={ringSrc(tone)}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 size-full object-contain"
          />
          <Glyph
            className="relative z-[1] size-[38%]"
            style={{ color: STRUCTURE_COLORS[tone].icon }}
            strokeWidth={2.25}
            aria-hidden
          />
        </span>
      ) : (
        <img
          src={kindIconSrc(tone, slot)}
          alt=""
          draggable={false}
          className="pointer-events-none size-full object-contain"
        />
      )}
      <StatusBadge status={status} />
    </span>
  );
}

/**
 * Tool / integration icon: Pipedream catalog logo only (transparent PNG/SVG).
 * If Pipedream has no logo, keep the node and show initials — never invent a mark.
 */
export function StructureAppIcon({
  appKey,
  status,
  className,
  imgSrc,
}: {
  appKey: string;
  status: string;
  className?: string;
  imgSrc?: string | null;
}) {
  const tone = statusToTone(status);
  const [failed, setFailed] = useState(false);
  const logoSrc = failed ? null : (imgSrc ?? getCachedIntegrationIcon(appKey) ?? null);

  useEffect(() => {
    setFailed(false);
  }, [appKey, imgSrc]);

  return (
    <span
      className={cn(
        "relative inline-flex size-[92px] shrink-0 items-center justify-center",
        className,
      )}
    >
      {statusShowsWarning(status) ? (
        <span
          className="absolute -top-7 left-1/2 z-10 -translate-x-1/2 text-[18px] leading-none"
          aria-hidden
        >
          ⚠️
        </span>
      ) : null}
      <span
        className="structure-shape relative flex size-full items-center justify-center rounded-full bg-[var(--structure-node-fill)]"
        style={{ border: `2px solid ${toneBorderColor(tone, status)}` }}
      >
        <img
          src={ringSrc(tone)}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-[11px] size-[calc(100%-22px)] object-contain"
        />
        {logoSrc ? (
          <img
            src={logoSrc}
            alt=""
            draggable={false}
            className="relative z-[1] size-7 bg-transparent object-contain"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="relative z-[1] text-[11px] font-bold uppercase tracking-wide text-foreground/70">
            {appKey.replaceAll("_", "").slice(0, 2)}
          </span>
        )}
        <StatusBadge status={status} />
      </span>
    </span>
  );
}

/** Circular shell for model/memory: themed fill + border + kind icon inside. */
export function StructureCircleNode({
  kind,
  status,
  label,
  selected,
  className,
  logoSrc,
}: {
  kind: string;
  status: string;
  label?: string;
  selected?: boolean;
  className?: string;
  logoSrc?: string | null;
}) {
  const tone = statusToTone(status);
  const showProviderLogo = kind === "model" && Boolean(logoSrc);
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <span className="relative inline-flex">
        {statusShowsWarning(status) ? (
          <span
            className="absolute -top-7 left-1/2 z-10 -translate-x-1/2 text-[18px] leading-none"
            aria-hidden
          >
            ⚠️
          </span>
        ) : null}
        <span
          className={cn(
            "structure-shape flex size-[100px] items-center justify-center rounded-full bg-[var(--structure-node-fill)] p-2.5",
            selected && "ring-2 ring-brand/45",
          )}
          style={{ border: `2px solid ${toneBorderColor(tone, status)}` }}
        >
          {showProviderLogo ? (
            <span className="relative flex size-[72px] items-center justify-center">
              <img
                src={ringSrc(tone)}
                alt=""
                draggable={false}
                className="pointer-events-none absolute inset-0 size-full object-contain"
              />
              <img
                src={logoSrc!}
                alt=""
                draggable={false}
                className="relative z-[1] size-[38%] bg-transparent object-contain"
              />
              <StatusBadge status={status} />
            </span>
          ) : (
            <StructureKindIcon kind={kind} status={status} className="size-[72px]" />
          )}
        </span>
      </span>
      {label ? (
        <p className="mt-1.5 max-w-[112px] truncate text-xs font-medium leading-tight">
          {label}
        </p>
      ) : null}
    </div>
  );
}
