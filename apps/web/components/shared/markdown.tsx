"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn(
        "prose prose-invert prose-sm max-w-none",
        "prose-headings:font-semibold prose-headings:tracking-tight",
        "prose-p:text-foreground/85 prose-li:text-foreground/85",
        "prose-table:text-sm prose-th:border-border prose-td:border-border",
        "prose-a:text-brand prose-a:no-underline hover:prose-a:underline",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
