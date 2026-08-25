"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser, useSignOut } from "@/hooks/use-auth";
import { useSubscription, useCreditUsage } from "@/hooks/use-billing";
import { useTranslation } from "@/hooks/use-translation";
import { useUiStore } from "@/store/ui-store";

export function UserMenu() {
  const { t } = useTranslation(["builder", "common"]);
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: subscription } = useSubscription();
  const { data: creditUsage } = useCreditUsage();
  const signOut = useSignOut();
  const openDialog = useUiStore((s) => s.openDialog);
  const credits = {
    used: Math.round(creditUsage?.used ?? 0),
    limit: Math.max(1, Math.round(creditUsage?.limit ?? 25)),
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          aria-label={t("common:a11y.userMenu")}
        >
          <Avatar className="size-7">
            <AvatarFallback className="bg-brand/30 text-xs">
              {(user?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-0">
        <div className="border-b border-border px-3 py-3">
          <p className="truncate text-sm font-medium">{user?.name ?? user?.email}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <div className="space-y-2 border-b border-border px-3 py-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{t("builder:profile.plan")}</span>
            <span className="font-medium">{subscription?.planName ?? t("common:plan.free")}</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full rounded-xl"
            onClick={() => openDialog("billing")}
          >
            {t("builder:profile.managePlan")}
          </Button>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t("builder:profile.credits")}</span>
              <span>
                {t("builder:profile.creditsValue", {
                  used: credits.used,
                  limit: credits.limit,
                })}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
              <div
                className="h-full rounded-full bg-brand"
                style={{
                  width: `${Math.min(100, (credits.used / Math.max(credits.limit, 1)) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground/70">
              {creditUsage?.billingInterval === "annual"
                ? t("builder:profile.creditsHintAnnual")
                : t("builder:profile.creditsHint")}
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2.5 w-full rounded-xl"
              onClick={() => openDialog("buyCredits")}
            >
              {t("builder:profile.buyCredits")}
            </Button>
          </div>
        </div>
        <div className="p-1">
          <DropdownMenuItem onSelect={() => openDialog("settings")}>
            {t("common:actions.settings")}
          </DropdownMenuItem>
          {user?.hasPasswordLogin ? (
            <DropdownMenuItem asChild>
              <Link href="/settings/password">{t("builder:profile.changePassword")}</Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              void signOut.mutateAsync().then(() => router.push("/"));
            }}
          >
            {t("common:actions.logout")}
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
