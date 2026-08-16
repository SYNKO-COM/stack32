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
          ? "h-[min(880px,calc(100vh-1.5rem))] max-w-[1320px] rounded-[28px]"
          : "h-full min-h-0 rounded-[28px]",
        className,
      )}
    >
      <div className="flex w-full min-w-0 flex-col lg:w-[min(100%,26.5rem)] xl:w-[28.5rem]">
        <div className="flex flex-1 flex-col overflow-y-auto px-7 py-8 sm:px-9 sm:py-9">
          <Logo href="/" size="lg" className="mb-8" />
          <div className="mb-7">
            <h1 className="text-[1.65rem] font-semibold tracking-tight text-foreground sm:text-[1.85rem]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <div className="mt-auto w-full pb-1">{children}</div>
        </div>
      </div>

      <div className="relative hidden min-w-0 flex-1 p-3 pl-0 lg:block">
        <AuthVisualPanel mode={mode} className="h-full min-h-full" />
      </div>
    </div>
  );
}
