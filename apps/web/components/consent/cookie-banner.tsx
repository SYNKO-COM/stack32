"use client";

import Link from "next/link";

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
      className="fixed inset-x-0 bottom-0 z-40 p-3 sm:p-4"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 rounded-2xl border border-border/80 bg-background/95 p-4 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.55)] backdrop-blur-md sm:p-5">
        <div className="space-y-2">
          <h2 id="cookie-banner-title" className="text-sm font-semibold sm:text-base">
            {t("banner.title")}
          </h2>
          <p id="cookie-banner-body" className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {t("banner.body")}
          </p>
          <p className="text-xs text-muted-foreground">
            <Link href="/legal/privacy" className="underline-offset-2 hover:underline">
              {t("banner.privacy")}
            </Link>
            {" · "}
            <Link href="/legal/cookies" className="underline-offset-2 hover:underline">
              {t("banner.cookies")}
            </Link>
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-full sm:min-w-32"
            onClick={rejectAll}
          >
            {t("banner.rejectAll")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-full sm:min-w-32"
            onClick={openPreferences}
          >
            {t("banner.customize")}
          </Button>
          <Button
            type="button"
            className="h-10 rounded-full sm:min-w-32"
            onClick={acceptAll}
          >
            {t("banner.acceptAll")}
          </Button>
        </div>
      </div>
    </div>
  );
}
