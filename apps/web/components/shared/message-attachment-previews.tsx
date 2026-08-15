"use client";

import { FileText } from "lucide-react";

import type { MessageAttachment } from "@/lib/chat/message-attachments";
import { cn } from "@/lib/utils";

/** Small thumbnails / file chips shown above a user chat bubble. */
export function MessageAttachmentPreviews({
  attachments,
  align = "right",
  className,
}: {
  attachments?: MessageAttachment[];
  align?: "left" | "right";
  className?: string;
}) {
  if (!attachments?.length) return null;

  return (
    <div
      className={cn(
        "mb-2 flex flex-wrap gap-2",
        align === "right" ? "justify-end" : "justify-start",
        className,
      )}
    >
      {attachments.map((att) =>
        att.kind === "image" && att.url ? (
          <a
            key={att.id}
            href={att.url}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-xl border border-border/60 bg-background/40 shadow-sm transition hover:opacity-90"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs */}
            <img
              src={att.url}
              alt={att.name}
              className="h-20 w-20 object-cover sm:h-24 sm:w-24"
            />
          </a>
        ) : (
          <span
            key={att.id}
            className="inline-flex max-w-[11rem] items-center gap-1.5 rounded-xl border border-border/60 bg-background/40 px-2.5 py-1.5 text-xs text-foreground/80"
            title={att.name}
          >
            <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{att.name}</span>
          </span>
        ),
      )}
    </div>
  );
}
