"use client";

import { CircleCheck, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AnimatedBackground } from "@/components/shared/animated-background";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";

type RefreshResult = {
  paid?: boolean;
  planKey?: string | null;
  status?: string | null;
};

/**
 * Poll server-side billing refresh so access appears within seconds of checkout
 * without trusting the browser alone (webhook remains canonical).
 */
export default function BillingSuccessPage() {
  const { t } = useTranslation("billing");
  const [paid, setPaid] = useState(false);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 12;

    const tick = async () => {
      attempts += 1;
      try {
        const res = await fetch("/api/billing/refresh", { method: "POST" });
        if (res.ok) {
          const data = (await res.json()) as RefreshResult;
          if (data.paid) {
            if (!cancelled) {
              setPaid(true);
              setPolling(false);
            }
            return;
          }
        }
      } catch {
        /* ignore transient */
      }
      if (attempts >= maxAttempts) {
        if (!cancelled) setPolling(false);
        return;
      }
      window.setTimeout(() => {
        void tick();
      }, 1500);
    };

    void tick();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <AnimatedBackground variant="soft" />
      <CircleCheck className="mb-6 size-14 text-emerald-400" aria-hidden="true" />
      <h1 className="text-3xl font-semibold tracking-tight">{t("success.title")}</h1>
      <p className="mt-3 text-muted-foreground">{t("success.subtitle")}</p>
      {polling && !paid ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {t("success.activating", {
            defaultValue: "Activating your plan…",
          })}
        </p>
      ) : null}
      {paid ? (
        <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">
          {t("success.activated", { defaultValue: "Your plan is active." })}
        </p>
      ) : null}
      <Button asChild className="mt-8 rounded-full">
        <Link href="/agents">{t("success.cta")}</Link>
      </Button>
    </div>
  );
}
