"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check, Hammer, Menu, Rocket, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { useAgent, usePublishAgent } from "@/hooks/use-agents";
import { useCurrentUser, useSignOut } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-billing";
import { useCreditUsage } from "@/hooks/use-workspaces";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";

const TABS = [
  { id: "build", icon: Hammer },
  { id: "agent", icon: Sparkles },
] as const;

type TabId = (typeof TABS)[number]["id"];

function ViewTabs({ agentId }: { agentId: string }) {
  const { t } = useTranslation("builder");
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  const active: TabId = pathname.endsWith("/agent") ? "agent" : "build";

  return (
    <nav
      aria-label={t("a11y.viewTabs")}
      className="glass flex items-center gap-1 rounded-full p-1"
    >
      {TABS.map(({ id, icon: Icon }) => {
        const isActive = id === active;
        return (
          <Link
            key={id}
            href={`/agents/${agentId}/${id}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground/80",
            )}
          >
            {isActive ? (
              <motion.span
                layoutId="active-view-tab"
                transition={
                  reducedMotion ? { duration: 0 } : { type: "spring", bounce: 0.2, duration: 0.5 }
                }
                className="glass-strong absolute inset-0 rounded-full bg-foreground/[0.06]"
                aria-hidden="true"
              />
            ) : null}
            <Icon className="relative z-10 size-4" aria-hidden="true" />
            <span
              className={cn(
                "relative z-10",
                isActive ? "inline" : "hidden sm:inline sm:opacity-70",
              )}
            >
              {t(`tabs.${id}`)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Topbar({ agentId }: { agentId: string }) {
  const { t } = useTranslation(["builder", "common"]);
  const router = useRouter();
  const { data: agent } = useAgent(agentId);
  const { data: user } = useCurrentUser();
  const { data: subscription } = useSubscription();
  const credits = useCreditUsage();
  const publishAgent = usePublishAgent();
  const signOut = useSignOut();
  const openDialog = useUiStore((s) => s.openDialog);
  const setMobileSidebarOpen = useUiStore((s) => s.setMobileSidebarOpen);

  const [publishOpen, setPublishOpen] = useState(false);
  const [publishedOpen, setPublishedOpen] = useState(false);

  const handlePublish = async () => {
    setPublishOpen(false);
    await publishAgent.mutateAsync(agentId);
    setPublishedOpen(true);
  };

  return (
    <header className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          aria-label={t("common:a11y.toggleSidebar")}
          onClick={() => setMobileSidebarOpen(true)}
        >
          <Menu aria-hidden="true" />
        </Button>
        <ViewTabs agentId={agentId} />
      </div>

      <div className="flex items-center gap-2">
        <span
          className="hidden items-center gap-1.5 font-mono text-xs text-muted-foreground/70 sm:flex"
          role="status"
        >
          <Check className="size-3.5 text-emerald-500/80" aria-hidden="true" />
          {t("common:autosave.saved")}
        </span>

        <ThemeToggle />

        <Button
          size="sm"
          className="gap-1.5 rounded-full"
          onClick={() => setPublishOpen(true)}
          disabled={publishAgent.isPending || agent?.status === "building"}
        >
          <Rocket className="size-3.5" aria-hidden="true" />
          {publishAgent.isPending ? t("builder:topbar.publishing") : t("builder:topbar.publish")}
        </Button>

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
                <span className="font-medium">
                  {subscription?.planName ?? t("common:plan.free")}
                </span>
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
                  {t("builder:profile.creditsHint")}
                </p>
              </div>
            </div>
            <div className="p-1">
              <DropdownMenuItem onSelect={() => openDialog("settings")}>
                {t("common:actions.settings")}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings/password">{t("builder:profile.changePassword")}</Link>
              </DropdownMenuItem>
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
      </div>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="glass-strong border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("builder:publishDialog.title")}</DialogTitle>
            <DialogDescription>{t("builder:publishDialog.body")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPublishOpen(false)}>
              {t("common:actions.cancel")}
            </Button>
            <Button onClick={() => void handlePublish()}>
              {t("builder:publishDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={publishedOpen} onOpenChange={setPublishedOpen}>
        <DialogContent className="glass-strong border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="size-5 text-emerald-400" aria-hidden="true" />
              {t("builder:publishDialog.successTitle")}
            </DialogTitle>
            <DialogDescription>{t("builder:publishDialog.successBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setPublishedOpen(false)}>{t("common:actions.gotIt")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
