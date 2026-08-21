"use client";

import {
  Check,
  Copy,
  ExternalLink,
  Hammer,
  Menu,
  RefreshCw,
  Rocket,
  Settings,
  Share2,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { UserMenu } from "@/components/builder/user-menu";
import { SegmentedTabs } from "@/components/shared/segmented-tabs";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAgent, usePublishAgent } from "@/hooks/use-agents";
import { useProfile } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { AgentServiceError, agentServiceErrorKey } from "@/lib/ai/agent-service-errors";
import { isPlanLimitError } from "@/lib/billing/plan-limit";
import { agentHasUnpublishedDraft } from "@/lib/domain/agent-publish";
import { SITE_URL } from "@/lib/site";
import { useUiStore } from "@/store/ui-store";

function ViewTabs({ agentId }: { agentId: string }) {
  const { t } = useTranslation("builder");
  const pathname = usePathname();
  const active = pathname.endsWith("/settings")
    ? "settings"
    : pathname.endsWith("/agent")
      ? "agent"
      : "build";

  return (
    <SegmentedTabs
      ariaLabel={t("a11y.viewTabs")}
      layoutId="active-view-tab"
      active={active}
      items={[
        { id: "build", href: `/agents/${agentId}/build`, label: t("tabs.build"), icon: Hammer },
        { id: "agent", href: `/agents/${agentId}/agent`, label: t("tabs.agent"), icon: Sparkles },
        {
          id: "settings",
          href: `/agents/${agentId}/settings`,
          label: t("tabs.settings"),
          icon: Settings,
        },
      ]}
    />
  );
}

function publishErrorKey(error: unknown): string {
  if (isPlanLimitError(error)) return "errors:publish.planRequired";
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: string }).code ?? "")
      : error instanceof Error
        ? error.message
        : "";
  if (code === "USERNAME_REQUIRED" || /USERNAME_REQUIRED/i.test(code)) {
    return "errors:publish.usernameRequired";
  }
  if (error instanceof AgentServiceError) return agentServiceErrorKey(error);
  if (error instanceof Error && /USERNAME_REQUIRED/i.test(error.message)) {
    return "errors:publish.usernameRequired";
  }
  return agentServiceErrorKey(error);
}

export function Topbar({ agentId }: { agentId: string }) {
  const { t } = useTranslation(["builder", "common", "errors"]);
  const { data: agent } = useAgent(agentId);
  const { data: profile } = useProfile();
  const publishAgent = usePublishAgent();
  const openDialog = useUiStore((s) => s.openDialog);
  const setMobileSidebarOpen = useUiStore((s) => s.setMobileSidebarOpen);

  const [shareOpen, setShareOpen] = useState(false);
  const [publishedOpen, setPublishedOpen] = useState(false);
  const [usernameRequiredOpen, setUsernameRequiredOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [publishedAsUpdate, setPublishedAsUpdate] = useState(false);
  const publishOpen = useUiStore((s) => s.publishConfirmOpen);
  const setPublishOpen = useUiStore((s) => s.setPublishConfirmOpen);

  const isPublished = agent?.status === "published";
  const hasUnpublishedDraft = agentHasUnpublishedDraft(agent);

  const resolvedPublicUrl = useMemo(() => {
    const username = profile?.username?.trim();
    const slug = agent?.slug?.trim();
    if (!username || !slug) return null;
    const origin = SITE_URL.replace(/\/$/, "");
    return `${origin}/@${username}/${slug}`;
  }, [agent?.slug, profile?.username]);

  const handlePublish = async () => {
    const updating = hasUnpublishedDraft;
    setPublishOpen(false);
    setPublishError(null);
    try {
      const result = await publishAgent.mutateAsync(agentId);
      const path = result.publicPath ?? "";
      const origin = SITE_URL.replace(/\/$/, "");
      setPublicUrl(path ? `${origin}${path}` : resolvedPublicUrl);
      setPublishedAsUpdate(updating);
      setPublishedOpen(true);
    } catch (error) {
      if (isPlanLimitError(error)) {
        openDialog("upgrade");
        return;
      }
      const key = publishErrorKey(error);
      if (key === "errors:publish.usernameRequired") {
        setUsernameRequiredOpen(true);
        return;
      }
      setPublishError(t(key));
    }
  };

  const openShare = () => {
    if (!profile?.username) {
      setUsernameRequiredOpen(true);
      return;
    }
    setPublicUrl(resolvedPublicUrl);
    setCopied(false);
    setShareOpen(true);
  };

  const copyLink = async () => {
    const url = publicUrl ?? resolvedPublicUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const displayUrl = publicUrl ?? resolvedPublicUrl;

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

        {hasUnpublishedDraft ? (
          <Button
            size="sm"
            className="gap-1.5 rounded-full px-2.5 sm:px-3"
            onClick={() => setPublishOpen(true)}
            disabled={publishAgent.isPending || agent?.status === "building"}
            aria-label={
              publishAgent.isPending
                ? t("builder:topbar.updating")
                : t("builder:topbar.update")
            }
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">
              {publishAgent.isPending
                ? t("builder:topbar.updating")
                : t("builder:topbar.update")}
            </span>
          </Button>
        ) : isPublished ? (
          <Button
            size="sm"
            className="gap-1.5 rounded-full px-2.5 sm:px-3"
            onClick={openShare}
            aria-label={t("builder:topbar.share")}
          >
            <Share2 className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{t("builder:topbar.share")}</span>
          </Button>
        ) : (
          <Button
            size="sm"
            className="gap-1.5 rounded-full px-2.5 sm:px-3"
            onClick={() => setPublishOpen(true)}
            disabled={publishAgent.isPending || agent?.status === "building"}
            aria-label={
              publishAgent.isPending
                ? t("builder:topbar.publishing")
                : t("builder:topbar.publish")
            }
          >
            <Rocket className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">
              {publishAgent.isPending
                ? t("builder:topbar.publishing")
                : t("builder:topbar.publish")}
            </span>
          </Button>
        )}

        <UserMenu />
      </div>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="glass-strong border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {hasUnpublishedDraft
                ? t("builder:publishDialog.updateTitle")
                : t("builder:publishDialog.title")}
            </DialogTitle>
            <DialogDescription>
              {hasUnpublishedDraft
                ? t("builder:publishDialog.updateBody")
                : t("builder:publishDialog.body")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPublishOpen(false)}>
              {t("common:actions.cancel")}
            </Button>
            <Button onClick={() => void handlePublish()}>
              {hasUnpublishedDraft
                ? t("builder:publishDialog.updateConfirm")
                : t("builder:publishDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="glass-strong border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="size-5 text-brand" aria-hidden="true" />
              {t("builder:publishDialog.shareTitle")}
            </DialogTitle>
            <DialogDescription>{t("builder:publishDialog.shareBody")}</DialogDescription>
          </DialogHeader>
          {displayUrl ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t("builder:publishDialog.publicUrl")}</p>
              <p className="break-all rounded-xl bg-foreground/[0.04] px-3 py-2 font-mono text-xs">
                {displayUrl}
              </p>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {displayUrl ? (
                <>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void copyLink()}>
                    <Copy className="size-3.5" aria-hidden="true" />
                    {copied ? t("common:actions.copied") : t("common:actions.copyLink")}
                  </Button>
                  <Button asChild size="sm" className="gap-1.5">
                    <Link href={displayUrl.replace(/^https?:\/\/[^/]+/i, "") || "/"}>
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                      {t("common:actions.openAgent")}
                    </Link>
                  </Button>
                </>
              ) : null}
            </div>
            <Button variant="ghost" onClick={() => setShareOpen(false)}>
              {t("common:actions.gotIt")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={publishedOpen} onOpenChange={setPublishedOpen}>
        <DialogContent className="glass-strong border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="size-5 text-emerald-400" aria-hidden="true" />
              {publishedAsUpdate
                ? t("builder:publishDialog.updateSuccessTitle")
                : t("builder:publishDialog.successTitle")}
            </DialogTitle>
            <DialogDescription>
              {publishedAsUpdate
                ? t("builder:publishDialog.updateSuccessBody")
                : t("builder:publishDialog.successBody")}
            </DialogDescription>
          </DialogHeader>
          {displayUrl ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t("builder:publishDialog.publicUrl")}</p>
              <p className="break-all rounded-xl bg-foreground/[0.04] px-3 py-2 font-mono text-xs">
                {displayUrl}
              </p>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {displayUrl ? (
                <>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void copyLink()}>
                    <Copy className="size-3.5" aria-hidden="true" />
                    {copied ? t("common:actions.copied") : t("common:actions.copyLink")}
                  </Button>
                  <Button asChild size="sm" className="gap-1.5">
                    <Link href={displayUrl.replace(/^https?:\/\/[^/]+/i, "") || "/"}>
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                      {t("common:actions.openAgent")}
                    </Link>
                  </Button>
                </>
              ) : null}
            </div>
            <Button variant="ghost" onClick={() => setPublishedOpen(false)}>
              {t("common:actions.gotIt")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={usernameRequiredOpen} onOpenChange={setUsernameRequiredOpen}>
        <DialogContent className="glass-strong border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("builder:publishDialog.usernameRequiredTitle")}</DialogTitle>
            <DialogDescription>{t("builder:publishDialog.usernameRequiredBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUsernameRequiredOpen(false)}>
              {t("common:actions.cancel")}
            </Button>
            <Button
              onClick={() => {
                setUsernameRequiredOpen(false);
                openDialog("settings");
              }}
            >
              {t("builder:publishDialog.goToSettings")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(publishError)} onOpenChange={(open) => !open && setPublishError(null)}>
        <DialogContent className="glass-strong border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("builder:publishDialog.errorTitle")}</DialogTitle>
            <DialogDescription>{publishError}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setPublishError(null)}>{t("common:actions.gotIt")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
