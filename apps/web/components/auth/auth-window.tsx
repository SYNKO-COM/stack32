"use client";

import { Logo } from "@/components/shared/logo";
import { AuthVisualPanel } from "@/components/auth/auth-visual-panel";
import { cn } from "@/lib/utils";

type AuthWindowProps = {
  mode: "login" | "signup";
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Page shell fills the viewport inset; modal inherits dialog size. */
  variant?: "page" | "modal";
  className?: string;
};

/**
 * Large split auth window (left form / right agent visual).
 * Used by the marketing AuthModal and by /login + /signup pages.
 * Visual panel is hidden below lg — form only on mobile/tablet.
 */
export function AuthWindow({
  mode,
  title,
  subtitle,
  children,
  variant = "page",
  className,
}: AuthWindowProps) {
  return (
    <div
      className={cn(
        "flex w-full overflow-hidden border border-border/70 bg-background shadow-[0_30px_80px_-40px_rgba(0,0,0,0.55)]",
        variant === "page"
          ? "h-auto max-h-[min(880px,calc(100dvh-1rem))] w-full max-w-[1320px] rounded-[20px] sm:max-h-[min(880px,calc(100dvh-1.5rem))] sm:rounded-[24px] lg:rounded-[28px]"
          : "h-full max-h-full min-h-0 rounded-[20px] sm:rounded-[24px] lg:rounded-[28px]",
        className,
      )}
    >
      <div className="flex w-full min-w-0 flex-col lg:w-[min(100%,26.5rem)] xl:w-[28.5rem]">
        <div className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden px-5 py-5 sm:px-7 sm:py-7 lg:px-9 lg:py-8">
          <Logo href="/" size="lg" className="mb-4 shrink-0 sm:mb-6 lg:mb-8" />
          <div className="mb-4 shrink-0 sm:mb-5 lg:mb-7">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-[1.65rem] lg:text-[1.85rem]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground sm:mt-2 sm:text-sm">
                {subtitle}
              </p>
            ) : null}
          </div>
          <div className="w-full shrink-0">{children}</div>
        </div>
      </div>

      <div className="relative hidden min-w-0 flex-1 p-2 pl-0 lg:block lg:p-3">
        <AuthVisualPanel mode={mode} className="h-full min-h-full" />
      </div>
    </div>
  );
}
