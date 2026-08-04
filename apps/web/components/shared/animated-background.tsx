"use client";

import { cn } from "@/lib/utils";

interface AnimatedBackgroundProps {
  /**
   * marketing — soft brand aurora + dotted grid;
   * editor — calmer workspace wash;
   * soft — minimal glow for auth/onboarding.
   */
  variant?: "marketing" | "editor" | "soft";
  className?: string;
}

export function AnimatedBackground({ variant = "marketing", className }: AnimatedBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none fixed inset-0 -z-10 overflow-hidden", className)}
    >
      <div className="absolute inset-0 bg-background" />
      <div className="bg-dotted-grid absolute inset-0 opacity-60 dark:opacity-70" />

      {variant === "marketing" ? (
        <>
          <div className="animate-aurora absolute -top-1/4 left-1/2 h-[55vh] w-[65vw] -translate-x-1/2 rounded-full bg-[color-mix(in_srgb,var(--brand-from)_28%,transparent)] opacity-40 blur-[140px] dark:opacity-25" />
          <div className="animate-aurora-slow absolute top-1/3 -left-1/4 h-[40vh] w-[40vw] rounded-full bg-[color-mix(in_srgb,var(--brand-to)_22%,transparent)] opacity-30 blur-[130px] dark:opacity-20" />
          <div className="animate-aurora absolute -right-1/4 bottom-0 h-[36vh] w-[42vw] rounded-full bg-[color-mix(in_srgb,var(--brand-from)_18%,transparent)] opacity-25 blur-[120px] dark:opacity-15" />
        </>
      ) : null}

      {variant === "editor" ? (
        <>
          <div className="absolute -top-1/4 left-1/2 h-[40vh] w-[50vw] -translate-x-1/2 rounded-full bg-[color-mix(in_srgb,var(--brand-from)_14%,transparent)] opacity-30 blur-[140px] dark:opacity-15" />
          <div className="absolute inset-0 bg-background/40 dark:bg-black/20" />
        </>
      ) : null}

      {variant === "soft" ? (
        <div className="animate-pulse-glow absolute top-1/4 left-1/2 h-[36vh] w-[48vw] -translate-x-1/2 rounded-full bg-[color-mix(in_srgb,var(--brand-from)_20%,transparent)] opacity-30 blur-[130px] dark:opacity-15" />
      ) : null}
    </div>
  );
}
