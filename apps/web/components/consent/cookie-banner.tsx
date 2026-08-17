"use client";

import Link from "next/link";
import { Cookie } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useConsent } from "@/components/consent/consent-provider";
import { useTranslation } from "@/hooks/use-translation";

export function CookieBanner() {
  const { decided, preferencesOpen, acceptAll, rejectAll, openPreferences } =
    useConsent();
  const { t } = useTranslation("consent");

  if (decided || preferencesOpen) return null;

  return (
    <div
      data-testid="cookie-banner"
      role="dialog"
      aria-labelledby="cookie-banner-title"
      aria-describedby="cookie-banner-body"
      className="fixed bottom-3 left-3 z-40 sm:bottom-4 sm:left-4"
    >
      <div
        className="flex w-[15.5rem] flex-col gap-2.5 rounded-2xl border border-border/80 bg-background/95 p-3.5 shadow-[0_16px_48px_-24px_rgba(0,0,0,0.55)] backdrop-blur-md sm:w-[16.5rem]"
      >
        <div className="flex items-start gap-2">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/40"
            aria-hidden="true"
          >
            <Cookie className="size-4 text-muted-foreground" />
          </span>
          <div className="min-w-0 space-y-1">
            <h2 id="cookie-banner-title" className="text-xs font-semibold leading-snug">
              {t("banner.title")}
            </h2>
            <p
              id="cookie-banner-body"
              className="text-[11px] leading-relaxed text-muted-foreground"
            >
              {t("banner.shortBody")}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-xl text-xs"
            onClick={acceptAll}
          >
            {t("banner.acceptAll")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-xl text-xs"
            onClick={rejectAll}
          >
            {t("banner.rejectAll")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 rounded-xl text-xs text-muted-foreground"
            onClick={openPreferences}
          >
            {t("banner.customize")}
          </Button>
        </div>

        <p className="text-[10px] leading-relaxed text-muted-foreground/80">
          <Link href="/legal/privacy" className="underline-offset-2 hover:underline">
            {t("banner.privacy")}
          </Link>
          {" · "}
          <Link href="/legal/cookies" className="underline-offset-2 hover:underline">
            {t("banner.cookies")}
          </Link>
        </p>
      </div>
    </div>
  );
}
