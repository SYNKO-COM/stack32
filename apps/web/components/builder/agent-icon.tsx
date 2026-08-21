"use client";

import {
  Bot,
  Briefcase,
  FileText,
  LifeBuoy,
  PenLine,
  Search,
  Sparkles,
} from "lucide-react";

import {
  AGENT_PRESET_ICON_KEYS,
  isAgentIconImageUrl,
} from "@/lib/marketplace/agent-avatar";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  briefcase: Briefcase,
  search: Search,
  "life-buoy": LifeBuoy,
  "pen-line": PenLine,
  "file-text": FileText,
  sparkles: Sparkles,
  bot: Bot,
};

export const AGENT_ICON_KEYS = [...AGENT_PRESET_ICON_KEYS];

export function AgentIcon({ icon, className }: { icon: string; className?: string }) {
  if (isAgentIconImageUrl(icon)) {
    return (
      <span
        className={cn(
          "relative flex size-8 shrink-0 overflow-hidden rounded-xl bg-foreground/[0.05]",
          className,
        )}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- remote agent avatars from storage */}
        <img src={icon} alt="" className="size-full object-cover" />
      </span>
    );
  }

  const Icon = ICONS[icon] ?? Bot;
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.05] text-foreground/80",
        className,
      )}
      aria-hidden="true"
    >
      <Icon className="size-4" />
    </span>
  );
}
