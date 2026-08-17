"use client";

import { useState } from "react";
import Link from "next/link";

import { useConsent } from "@/components/consent/consent-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { hasGpc } from "@/lib/consent";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

function CategorySwitch({
  id,
  checked,
  disabled,
  onCheckedChange,
  title,
  description,
}: {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange?: (next: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-border/70 p-4">
      <div className="min-w-0">
        <p id={`${id}-title`} className="text-sm font-medium">
          {title}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-title`}
        disabled={disabled}
        onClick={() => onCheckedChange?.(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors",
          checked ? "border-brand bg-brand" : "border-border bg-muted",
          disabled && "cursor-not-allowed opacity-70",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow-sm transition-transform",
            checked && "translate-x-5",
          )}
        />
      </button>
    </div>
  );
}

function PreferencesForm({
  initialAnalytics,
  initialMarketing,
  gpc,
  onClose,
  onSave,
}: {
  initialAnalytics: boolean;
  initialMarketing: boolean;
  gpc: boolean;
  onClose: () => void;
  onSave: (next: { analytics: boolean; marketing: boolean }) => void;
}) {
  const { t } = useTranslation("consent");
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [marketing, setMarketing] = useState(gpc ? false : initialMarketing);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("preferences.title")}</DialogTitle>
        <DialogDescription>{t("preferences.description")}</DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <CategorySwitch
          id="consent-necessary"
          checked
          disabled
          title={t("preferences.necessary.title")}
          description={t("preferences.necessary.description")}
        />
        <CategorySwitch
          id="consent-analytics"
          checked={analytics}
          onCheckedChange={setAnalytics}
          title={t("preferences.analytics.title")}
          description={t("preferences.analytics.description")}
        />
        <CategorySwitch
          id="consent-marketing"
          checked={marketing && !gpc}
          disabled={gpc}
          onCheckedChange={setMarketing}
          title={t("preferences.marketing.title")}
          description={t("preferences.marketing.description")}
        />
      </div>

      {gpc ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{t("preferences.gpcNote")}</p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        <Link href="/legal/cookies" className="underline-offset-2 hover:underline" onClick={onClose}>
          {t("banner.cookies")}
        </Link>
        {" · "}
        <Link href="/legal/privacy" className="underline-offset-2 hover:underline" onClick={onClose}>
          {t("banner.privacy")}
        </Link>
      </p>

      <DialogFooter>
        <Button
          type="button"
          className="rounded-full"
          onClick={() => onSave({ analytics, marketing: gpc ? false : marketing })}
        >
          {t("preferences.save")}
        </Button>
      </DialogFooter>
    </>
  );
}

export function CookiePreferencesDialog() {
  const { consent, preferencesOpen, closePreferences, savePreferences } = useConsent();
  const gpc = hasGpc();

  return (
    <Dialog open={preferencesOpen} onOpenChange={(open) => (!open ? closePreferences() : undefined)}>
      <DialogContent className="max-h-[min(90dvh,40rem)] overflow-y-auto sm:max-w-lg">
        {preferencesOpen ? (
          <PreferencesForm
            key={consent?.updatedAt ?? "undecided"}
            initialAnalytics={Boolean(consent?.analytics)}
            initialMarketing={Boolean(consent?.marketing)}
            gpc={gpc}
            onClose={closePreferences}
            onSave={savePreferences}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function CookiePreferencesButton({
  className,
  variant = "link",
}: {
  className?: string;
  variant?: "link" | "outline";
}) {
  const { openPreferences } = useConsent();
  const { t } = useTranslation("consent");

  return (
    <Button
      type="button"
      variant={variant === "link" ? "link" : "outline"}
      className={cn(
        variant === "link" && "h-auto p-0 text-sm text-muted-foreground hover:text-foreground",
        className,
      )}
      onClick={openPreferences}
    >
      {t("actions.manage")}
    </Button>
  );
}

export function DoNotSellButton({ className }: { className?: string }) {
  const { doNotSellOrShare } = useConsent();
  const { t } = useTranslation("consent");

  return (
    <Button
      type="button"
      variant="link"
      className={cn("h-auto p-0 text-sm text-muted-foreground hover:text-foreground", className)}
      onClick={doNotSellOrShare}
    >
      {t("banner.doNotSell")}
    </Button>
  );
}
