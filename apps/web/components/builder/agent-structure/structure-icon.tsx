"use client";

import { Check, Loader2, Pause, Send, X } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

/** Visual tone for structure nodes (idle = orange, not green). */
export type StructureTone = "orange" | "green" | "amber" | "red";

export const STRUCTURE_COLORS = {
  orange: { inner: "#fedbb4", icon: "#fa8908", border: "#0a0a0a" },
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

/** Outer border color for the node shell (white fill always). */
export function toneBorderColor(tone: StructureTone, status: string): string {
  if (statusShowsPause(status) || statusShowsWarning(status)) return STRUCTURE_COLORS.amber.border;
  if (statusShowsSpinner(status)) return STRUCTURE_COLORS.orange.icon;
  if (statusShowsCheck(status)) return STRUCTURE_COLORS.green.border;
  if (statusShowsError(status)) return STRUCTURE_COLORS.red.border;
  return STRUCTURE_COLORS.orange.border;
}

const KIND_SLOT: Record<string, string> = {
  trigger_chat: "chat",
  trigger_schedule: "chat",
  agent: "agent",
  memory: "memory",
  model: "model",
  output: "output",
};

const APP_BRAND: Record<string, { slug?: string; domain?: string }> = {
  gmail: { slug: "gmail", domain: "gmail.com" },
  google_calendar: { slug: "googlecalendar", domain: "calendar.google.com" },
  calendar: { slug: "googlecalendar", domain: "calendar.google.com" },
  google_docs: { slug: "googledocs", domain: "docs.google.com" },
  google_doc: { slug: "googledocs", domain: "docs.google.com" },
  google_sheets: { slug: "googlesheets", domain: "sheets.google.com" },
  google_drive: { slug: "googledrive", domain: "drive.google.com" },
  google_slides: { slug: "googleslides", domain: "slides.google.com" },
  slack: { slug: "slack", domain: "slack.com" },
  slack_v2: { slug: "slack", domain: "slack.com" },
  notion: { slug: "notion", domain: "notion.so" },
  hubspot: { slug: "hubspot", domain: "hubspot.com" },
  stripe: { slug: "stripe", domain: "stripe.com" },
  salesforce: { slug: "salesforce", domain: "salesforce.com" },
  pipedrive: { slug: "pipedrive", domain: "pipedrive.com" },
  box: { slug: "box", domain: "box.com" },
  mural: { slug: "mural", domain: "mural.co" },
  "1crm": { domain: "1crm.com" },
  microsoft_outlook: { slug: "microsoftoutlook", domain: "outlook.com" },
  outlook: { slug: "microsoftoutlook", domain: "outlook.com" },
  microsoft_teams: { slug: "microsoftteams", domain: "teams.microsoft.com" },
  onedrive: { slug: "microsoftonedrive", domain: "onedrive.live.com" },
  github: { slug: "github", domain: "github.com" },
  gitlab: { slug: "gitlab", domain: "gitlab.com" },
  linear: { slug: "linear", domain: "linear.app" },
  asana: { slug: "asana", domain: "asana.com" },
  trello: { slug: "trello", domain: "trello.com" },
  jira: { slug: "jira", domain: "atlassian.com" },
  zendesk: { slug: "zendesk", domain: "zendesk.com" },
  intercom: { slug: "intercom", domain: "intercom.com" },
  dropbox: { slug: "dropbox", domain: "dropbox.com" },
  airtable: { slug: "airtable", domain: "airtable.com" },
  shopify: { slug: "shopify", domain: "shopify.com" },
  discord: { slug: "discord", domain: "discord.com" },
  telegram: { slug: "telegram", domain: "telegram.org" },
  whatsapp: { slug: "whatsapp", domain: "whatsapp.com" },
};

function kindIconSrc(tone: StructureTone, slot: string): string {
  return `/structure-icons/${tone}/${slot}.png`;
}

function ringSrc(tone: StructureTone): string {
  return `/structure-icons/rings/${tone}.png`;
}

function brandLogoCandidates(appKey: string): string[] {
  const key = appKey.toLowerCase();
  const meta = APP_BRAND[key];
  const out: string[] = [];
  if (meta?.slug) out.push(`https://cdn.simpleicons.org/${meta.slug}`);
  if (meta?.domain) {
    out.push(`https://www.google.com/s2/favicons?domain=${meta.domain}&sz=128`);
  }
  // Generic favicon guess from app key
  if (!meta?.domain && key.length > 1) {
    out.push(`https://www.google.com/s2/favicons?domain=${key.replaceAll("_", "")}.com&sz=128`);
  }
  return out;
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
  // Orange pack has no dedicated output asset — compose ring + plane.
  const composeOutput = slot === "output" && tone === "orange";

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {composeOutput ? (
        <span className="relative flex size-full items-center justify-center">
          <img
            src={ringSrc(tone)}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 size-full object-contain"
          />
          <Send
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
 * Tool / integration icon: empty colored ring + brand logo (logos keep brand colors).
 */
export function StructureAppIcon({
  appKey,
  status,
  className,
}: {
  appKey: string;
  status: string;
  className?: string;
}) {
  const tone = statusToTone(status);
  const candidates = brandLogoCandidates(appKey);
  const [logoIndex, setLogoIndex] = useState(0);
  const logoSrc = candidates[logoIndex];

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
        className="structure-shape relative flex size-full items-center justify-center rounded-full bg-white"
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
            className="relative z-[1] size-7 object-contain"
            onError={() => setLogoIndex((i) => i + 1)}
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

/** Circular shell for model/memory: white + border + full kind icon inside. */
export function StructureCircleNode({
  kind,
  status,
  label,
  selected,
  className,
}: {
  kind: string;
  status: string;
  label?: string;
  selected?: boolean;
  className?: string;
}) {
  const tone = statusToTone(status);
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
            "structure-shape flex size-[100px] items-center justify-center rounded-full bg-white p-2.5",
            selected && "ring-2 ring-brand/45",
          )}
          style={{ border: `2px solid ${toneBorderColor(tone, status)}` }}
        >
          <StructureKindIcon kind={kind} status={status} className="size-[72px]" />
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
