"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createWhopCreditTopUpSession } from "@/lib/actions/billing";
import {
  CREDIT_TOPUP_MAX,
  CREDIT_TOPUP_MIN,
  CREDIT_TOPUP_STEP,
  priceCreditTopUp,
} from "@/lib/billing/plans";
import { useSubscription } from "@/hooks/use-billing";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";

const WhopCheckoutEmbed = dynamic(
  () => import("@whop/checkout/react").then((mod) => mod.WhopCheckoutEmbed),
  { ssr: false },
);

const PRESETS = [50, 100, 200, 400, 800, 2000] as const;

function formatUsd(value: number, locale: string) {
  return new Intl.NumberFormat(locale.startsWith("fr") ? "fr-FR" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function BuyCreditsDialog() {
  const { t, i18n } = useTranslation(["billing", "builder", "common"]);
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const activeDialog = useUiStore((s) => s.activeDialog);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const openDialog = useUiStore((s) => s.openDialog);
  const { data: subscription } = useSubscription();

  const open = activeDialog === "buyCredits";
  const isPaid =
    Boolean(subscription?.planKey) &&
    subscription?.planKey !== "free" &&
    (subscription?.status === "active" || subscription?.status === "trialing");

  const [credits, setCredits] = useState(100);
  const [step, setStep] = useState<"configure" | "pay" | "done">("configure");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priced = useMemo(() => priceCreditTopUp(credits), [credits]);
  const locale = i18n.language || "en";
  const progress = ((credits - CREDIT_TOPUP_MIN) / (CREDIT_TOPUP_MAX - CREDIT_TOPUP_MIN)) * 100;

  useEffect(() => {
    if (!open) {
      setStep("configure");
      setSessionId(null);
      setError(null);
      setLoading(false);
      setCredits(100);
    }
  }, [open]);

  const whopTheme = theme === "dark" ? "dark" : "light";
  const whopBackground = theme === "dark" ? "#080808" : "#ffffff";
  const site =
    typeof window !== "undefined" ? window.location.origin : "https://stack32.com";

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      const session = await createWhopCreditTopUpSession({ credits: priced.credits });
      if (session.sessionId === "mock") {
        setStep("done");
          await queryClient.invalidateQueries({ queryKey: ["billing"] });
          return;
      }
      setSessionId(session.sessionId);
      setStep("pay");
    } catch (err) {
      const code = err instanceof Error ? err.message : "CHECKOUT_FAILED";
      setError(code === "PAID_PLAN_REQUIRED" ? t("billing:topup.paidRequired") : t("billing:topup.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? closeDialog() : undefined)}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "glass-strong overflow-hidden border-border p-0 sm:max-w-lg",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
        )}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <button
              type="button"
              onClick={() => closeDialog()}
              className="absolute top-3 right-3 z-10 rounded-full p-1.5 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
              aria-label={t("common:actions.close", { defaultValue: "Close" })}
            >
              <X className="size-4" />
            </button>

            {step === "configure" ? (
              <div className="px-6 pt-6 pb-5">
                <DialogHeader className="pr-8 text-left">
                  <div className="mb-3 inline-flex size-10 items-center justify-center rounded-2xl bg-brand/15 text-brand">
                    <Sparkles className="size-5" aria-hidden />
                  </div>
                  <DialogTitle className="text-xl tracking-tight">
                    {t("billing:topup.title")}
                  </DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground">
                    {t("billing:topup.subtitle")}
                  </DialogDescription>
                </DialogHeader>

                {!isPaid ? (
                  <div className="mt-6 space-y-4">
                    <p className="rounded-2xl border border-border/70 bg-foreground/[0.03] px-4 py-3 text-sm text-muted-foreground">
                      {t("billing:topup.paidRequired")}
                    </p>
                    <Button
                      className="w-full rounded-full"
                      onClick={() => {
                        closeDialog();
                        openDialog("upgrade");
                      }}
                    >
                      {t("billing:topup.seePlans")}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-6 space-y-6">
                    <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-brand/[0.07] via-transparent to-transparent p-5">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            {t("billing:topup.creditsLabel")}
                          </p>
                          <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
                            {priced.credits.toLocaleString(locale.startsWith("fr") ? "fr-FR" : "en-US")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            {t("billing:topup.priceLabel")}
                          </p>
                          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-brand">
                            {formatUsd(priced.chargeUsd, locale)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-6">
                        <input
                          type="range"
                          min={CREDIT_TOPUP_MIN}
                          max={CREDIT_TOPUP_MAX}
                          step={CREDIT_TOPUP_STEP}
                          value={credits}
                          onChange={(e) => setCredits(Number(e.target.value))}
                          className="credit-topup-slider w-full"
                          style={{
                            background: `linear-gradient(to right, var(--brand) ${progress}%, color-mix(in srgb, var(--foreground) 12%, transparent) ${progress}%)`,
                          }}
                          aria-label={t("billing:topup.sliderAria")}
                        />
                        <div className="mt-2 flex justify-between text-[11px] text-muted-foreground/80">
                          <span>{CREDIT_TOPUP_MIN}</span>
                          <span>{CREDIT_TOPUP_MAX.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {PRESETS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setCredits(n)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                            credits === n
                              ? "border-brand/50 bg-brand/15 text-foreground"
                              : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground",
                          )}
                        >
                          {n.toLocaleString()}
                        </button>
                      ))}
                    </div>

                    <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                      {t("billing:topup.hint", {
                        price: formatUsd(priced.usdPerCreditSell, locale),
                      })}
                    </p>

                    {error ? (
                      <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {error}
                      </p>
                    ) : null}

                    <Button
                      className="w-full rounded-full"
                      size="lg"
                      disabled={loading}
                      onClick={() => void startCheckout()}
                    >
                      {loading
                        ? t("billing:topup.preparing")
                        : t("billing:topup.buy", {
                            amount: formatUsd(priced.chargeUsd, locale),
                          })}
                    </Button>
                  </div>
                )}
              </div>
            ) : null}

            {step === "pay" && sessionId ? (
              <div className="flex max-h-[min(80vh,640px)] flex-col">
                <div className="border-b border-border/60 px-5 py-4 pr-12">
                  <DialogTitle className="text-base">
                    {t("billing:topup.payTitle")}
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-sm">
                    {t("billing:topup.paySubtitle", {
                      credits: priced.credits,
                      amount: formatUsd(priced.chargeUsd, locale),
                    })}
                  </DialogDescription>
                </div>
                <div className="min-h-[360px] flex-1 overflow-y-auto bg-background">
                  <WhopCheckoutEmbed
                    key={`${sessionId}-${whopTheme}`}
                    sessionId={sessionId}
                    theme={whopTheme}
                    themeOptions={{ backgroundColor: whopBackground }}
                    returnUrl={`${site}/billing/success?topup=1`}
                    setupFutureUsage="off_session"
                    onComplete={() => {
                      setStep("done");
                      void queryClient.invalidateQueries({ queryKey: ["billing"] });
                    }}
                  />
                </div>
                <div className="border-t border-border/60 px-5 py-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full"
                    onClick={() => {
                      setStep("configure");
                      setSessionId(null);
                    }}
                  >
                    {t("billing:topup.back")}
                  </Button>
                </div>
              </div>
            ) : null}

            {step === "done" ? (
              <div className="px-6 py-10 text-center">
                <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-brand/15 text-brand">
                  <Sparkles className="size-5" />
                </div>
                <DialogTitle className="text-xl">{t("billing:topup.successTitle")}</DialogTitle>
                <DialogDescription className="mt-2">
                  {t("billing:topup.successBody", { credits: priced.credits })}
                </DialogDescription>
                <Button className="mt-6 rounded-full" onClick={() => closeDialog()}>
                  {t("billing:topup.done")}
                </Button>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
