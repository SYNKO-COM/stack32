"use client";

import { createPortal } from "react-dom";

import { LogoMark } from "@/components/shared/logo";
import { cn } from "@/lib/utils";

/** Centered brand mark pulse — page refresh / auth settle (icon only). */
export function BrandLoader({
  className,
  label,
  size = "md",
}: {
  className?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
}) {
  const box = size === "lg" ? "size-16" : size === "sm" ? "size-10" : "size-14";
  const mark = size === "lg" ? "size-9" : size === "sm" ? "size-5" : "size-8";

  return (
    <div
      className={cn("flex items-center justify-center", className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className={cn("relative flex items-center justify-center", box)}>
        <span className="absolute inset-0 animate-ping rounded-3xl bg-brand/25" />
        <span className="relative flex items-center justify-center">
          <LogoMark className={mark} />
        </span>
      </span>
      {label ? <span className="sr-only">{label}</span> : null}
    </div>
  );
}

/** Full-viewport card while creating an agent (portaled so sidebar glass can't trap it). */
export function CreatingAgentOverlay({
  open,
  title,
  hint,
}: {
  open: boolean;
  title: string;
  hint: string;
}) {
  // Client-only portal: avoid SSR/document mismatch without sync setState-in-effect.
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/75 backdrop-blur-md"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="glass flex flex-col items-center gap-4 rounded-3xl px-10 py-9 shadow-2xl">
        <span className="relative flex size-16 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-3xl bg-brand/20" />
          <span className="glass relative flex size-16 items-center justify-center rounded-3xl">
            <LogoMark className="size-9" />
          </span>
        </span>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
