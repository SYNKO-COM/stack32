"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn(
        // Theme-aware: never force prose-invert (it paints strong/code white on light bg).
        "prose prose-sm max-w-none text-foreground",
        "prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground",
        "prose-p:text-foreground/90 prose-li:text-foreground/90 prose-strong:text-foreground",
        "prose-strong:font-bold prose-em:text-foreground",
        "prose-code:rounded prose-code:bg-foreground/[0.06] prose-code:px-1 prose-code:py-0.5",
        "prose-code:font-semibold prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:bg-foreground/[0.04] prose-pre:text-foreground",
        "prose-table:text-sm prose-th:border-border prose-td:border-border",
        "prose-a:text-brand prose-a:no-underline hover:prose-a:underline",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
