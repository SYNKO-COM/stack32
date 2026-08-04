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

export function AgentIcon({ icon, className }: { icon: string; className?: string }) {
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
