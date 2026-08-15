"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn(
        // Theme-aware: never force prose-invert (it paints strong/code white on light bg).
        "prose prose-sm max-w-none min-w-0 overflow-hidden break-words text-foreground [overflow-wrap:anywhere]",
        "prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground",
        "prose-p:text-foreground/90 prose-li:text-foreground/90 prose-strong:text-foreground",
        "prose-strong:font-bold prose-em:text-foreground",
        "prose-code:rounded prose-code:break-all prose-code:bg-foreground/[0.06] prose-code:px-1 prose-code:py-0.5",
        "prose-code:font-semibold prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:max-w-full prose-pre:overflow-x-auto prose-pre:bg-foreground/[0.04] prose-pre:text-foreground",
        "prose-table:text-sm prose-th:border-border prose-td:border-border",
        "prose-a:break-all prose-a:text-brand prose-a:no-underline hover:prose-a:underline",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) => (
            <a
              {...props}
              href={href}
              className="break-all [overflow-wrap:anywhere]"
              rel="noopener noreferrer"
              target="_blank"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
