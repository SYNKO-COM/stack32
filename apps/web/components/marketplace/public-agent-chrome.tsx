"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { UserMenu } from "@/components/builder/user-menu";
import { BillingDialog } from "@/components/billing/billing-dialog";
import { BuyCreditsDialog } from "@/components/billing/buy-credits-dialog";
import { UpgradeDialog } from "@/components/billing/upgrade-dialog";
import { SettingsDialog } from "@/components/builder/settings-dialog";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";

/**
 * Shared chrome for public agent pages: Stack32 mark centered, account on the right.
 * Authenticated avatar navigates to the agent workspace (build a new agent).
 */
export function PublicAgentChrome({
  children,
  loginNext,
  accountHref = "/agents",
  accountMode = "workspace",
  onBack,
}: {
  children: React.ReactNode;
  loginNext: string;
  accountHref?: string;
  /** `workspace` = avatar links to /agents; `menu` = full UserMenu dropdown. */
  accountMode?: "workspace" | "menu";
  /** Optional back control on the far left (e.g. leave usage → landing). */
  onBack?: () => void;
}) {
  const { t } = useTranslation("common");
  const { data: user, isLoading } = useCurrentUser();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="relative z-20 flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-4 py-3 md:px-6">
        <div className="flex min-w-20 items-center justify-start sm:min-w-28">
          {onBack ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              onClick={onBack}
              aria-label={t("publicAgent.backToListing")}
              title={t("publicAgent.backToListing")}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Logo href="/" size="default" />
        </div>
        <div className="flex min-w-20 items-center justify-end gap-0.5 sm:min-w-36 sm:gap-1">
          <ThemeToggle />
          <LanguageSwitcher />
          {isLoading ? null : user ? (
            accountMode === "menu" ? (
              <UserMenu />
            ) : (
              <Button
                asChild
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
                aria-label={t("publicAgent.createOwnAgent")}
                title={t("publicAgent.createOwnAgent")}
              >
                <Link href={accountHref}>
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-brand/30 text-xs">
                      {(user.name ?? user.email ?? "?").slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Link>
              </Button>
            )
          ) : (
            <Button asChild size="sm" variant="outline" className="rounded-full">
              <Link href={`/login?next=${encodeURIComponent(loginNext)}`}>
                {t("actions.signIn")}
              </Link>
            </Button>
          )}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      <SettingsDialog />
      <BillingDialog />
      <UpgradeDialog />
      <BuyCreditsDialog />
    </div>
  );
}
