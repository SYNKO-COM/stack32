"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Lock } from "lucide-react";
import { Trans } from "react-i18next";

import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import { createWhopCheckoutSession } from "@/lib/actions/billing";
import { PLANS, pricePlanSelection, type BillingInterval, type PlanKey } from "@/lib/billing/plans";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

const WhopCheckoutEmbed = dynamic(
  () => import("@whop/checkout/react").then((mod) => mod.WhopCheckoutEmbed),
  { ssr: false },
);

type Props = {
  planKey: Exclude<PlanKey, "free">;
  interval: BillingInterval;
  creditsMonthly: number;
};

function ConsentCheckbox({
  id,
  checked,
  onCheckedChange,
  children,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm leading-snug">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className={cn(
          "mt-0.5 size-4 shrink-0 cursor-pointer appearance-none rounded-full border bg-background",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
          checked
            ? "border-brand bg-brand shadow-[inset_0_0_0_3px_hsl(var(--background))]"
            : "border-brand/60 [animation:consent-nudge_2.2s_ease-in-out_infinite]",
        )}
      />
      <span className="text-muted-foreground [&_a]:font-medium [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2">
        {children}
      </span>
    </label>
  );
}

export function WhopCheckoutClient({
  planKey,
  interval,
  creditsMonthly,
}: Props) {
  const { t, i18n } = useTranslation(["billing", "marketing"]);
  const { theme } = useTheme();
  const router = useRouter();
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedImmediate, setAcceptedImmediate] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canProceed = acceptedTerms && acceptedImmediate;
  const priced = pricePlanSelection(planKey, interval, creditsMonthly);
  const locale = i18n.language || "en";
  const amountLabel = new Intl.NumberFormat(locale.startsWith("fr") ? "fr-FR" : "en-US", {
    style: "currency",
    currency: "USD",
  }).format(priced.chargeUsd);
  const monthlyLabel = new Intl.NumberFormat(locale.startsWith("fr") ? "fr-FR" : "en-US", {
    style: "currency",
    currency: "USD",
  }).format(priced.displayMonthlyUsd);
  const planName = t(`marketing:pricing.${planKey}.name`);
  const featureItems = t(`marketing:pricing.${planKey}.features`, { returnObjects: true });
  const features = [
    ...(Array.isArray(featureItems) ? featureItems : []),
    t(`marketing:pricing.${planKey}.${PLANS[planKey].integrationsLabelKey}`),
  ];

  // Whop embed: follow Stack32 theme toggle (not only OS preference).
  const whopTheme = theme === "dark" ? "dark" : "light";
  const whopBackground = theme === "dark" ? "#080808" : "#ffffff";

  useEffect(() => {
    if (!canProceed) return;
    if (sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const session = await createWhopCheckoutSession({
          planKey,
          interval,
          creditsMonthly,
        });
        if (!cancelled) setSessionId(session.sessionId);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "CHECKOUT_FAILED");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canProceed, planKey, interval, creditsMonthly, sessionId]);

  useEffect(() => {
    if (!canProceed) return;
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    document
      .getElementById("checkout-payment")
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [canProceed]);

  const site =
    typeof window !== "undefined" ? window.location.origin : "https://stack32.com";

  const paymentReady = canProceed && Boolean(sessionId) && !error;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-3 pb-4 sm:px-6 sm:pb-6 lg:px-8 lg:pb-8">
      <div className="flex min-h-[min(720px,calc(100dvh-5.5rem))] flex-1 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-background shadow-[0_30px_80px_-40px_rgba(0,0,0,0.55)] sm:rounded-[24px] lg:flex-row lg:rounded-[28px]">
        <section
          id="checkout-payment"
          className="relative order-2 flex min-h-[320px] flex-1 flex-col bg-background lg:order-1 lg:min-h-0"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
            <h1 className="text-sm font-medium sm:text-base">{t("billing:checkout.paymentTitle")}</h1>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">
              {planName} · {amountLabel}
            </p>
          </div>

          <div className="relative min-h-0 flex-1 bg-background">
            {!canProceed ? (
              <div
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center"
                role="status"
              >
                <span className="flex size-11 items-center justify-center rounded-full border border-border bg-background">
                  <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
                </span>
                <p className="text-sm font-medium text-foreground">
                  {t("billing:checkout.unlockTitle")}
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {t("billing:checkout.unlockHint")}
                </p>
              </div>
            ) : null}

            {canProceed && loading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/90">
                <p className="text-sm text-muted-foreground">{t("billing:checkout.loading")}</p>
              </div>
            ) : null}

            {error ? (
              <div className="flex h-full items-center p-4 sm:p-6">
                <div className="w-full rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
                  <p className="font-medium">{t("billing:checkout.errorTitle")}</p>
                  <p className="mt-1 text-muted-foreground">{error}</p>
                  <Button asChild className="mt-4 rounded-full" variant="outline">
                    <Link href="/billing/plans">{t("billing:checkout.backToPricing")}</Link>
                  </Button>
                </div>
              </div>
            ) : null}

            {paymentReady && sessionId ? (
              <div className="h-full min-h-[360px] overflow-y-auto bg-background">
                <WhopCheckoutEmbed
                  key={`${sessionId}-${whopTheme}`}
                  sessionId={sessionId}
                  theme={whopTheme}
                  themeOptions={{ backgroundColor: whopBackground }}
                  returnUrl={`${site}/billing/success`}
                  setupFutureUsage="off_session"
                  onComplete={() => {
                    router.push("/billing/success");
                  }}
                />
              </div>
            ) : null}
          </div>
        </section>

        <aside className="order-1 flex w-full shrink-0 flex-col border-b border-border/70 bg-background lg:order-2 lg:w-[min(100%,24.5rem)] lg:border-b-0 lg:border-l xl:w-[26.5rem]">
          <div className="border-b border-border/60 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-medium sm:text-base">{t("billing:checkout.summaryTitle")}</h2>
          </div>

          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-5 sm:px-5">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("billing:checkout.planLabel")}
              </p>
              <p className="mt-1 text-xl font-semibold tracking-tight">{planName}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("billing:checkout.subtitle", {
                  plan: planName,
                  credits: creditsMonthly,
                  amount: monthlyLabel,
                  period: t("billing:checkout.perMonth"),
                })}
              </p>
              {interval === "annual" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("marketing:pricing.billedAnnually", { amount: amountLabel })}
                </p>
              ) : null}
              <Link
                href="/billing/plans"
                className="mt-2 inline-block text-xs font-medium text-brand underline-offset-2 hover:underline"
              >
                {t("billing:checkout.changePlan")}
              </Link>
            </div>

            <div className="rounded-2xl border border-border/70 bg-background p-4">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("billing:checkout.dueToday")}
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{amountLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("marketing:pricing.creditsPerMonth", { count: creditsMonthly })}
                {interval === "annual" ? ` · ${t("billing:checkout.perYear")}` : ""}
              </p>
            </div>

            <ul className="space-y-2">
              {features.slice(0, 6).map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <div
              className={cn(
                "mt-auto space-y-3 rounded-2xl border p-4",
                canProceed
                  ? "border-border/70 bg-background"
                  : "border-brand/25 bg-brand/[0.04]",
              )}
            >
              <ConsentCheckbox
                id="whop-checkout-accept-terms"
                checked={acceptedTerms}
                onCheckedChange={setAcceptedTerms}
              >
                <Trans
                  i18nKey="billing:checkout.consents.terms"
                  components={{
                    terms: <Link href="/legal/terms" target="_blank" rel="noreferrer" />,
                    sales: <Link href="/legal/sales" target="_blank" rel="noreferrer" />,
                    refunds: <Link href="/legal/refunds" target="_blank" rel="noreferrer" />,
                  }}
                />
              </ConsentCheckbox>
              <ConsentCheckbox
                id="whop-checkout-accept-immediate"
                checked={acceptedImmediate}
                onCheckedChange={setAcceptedImmediate}
              >
                {t("billing:checkout.consents.immediate")}
              </ConsentCheckbox>
              <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                {t("billing:checkout.consents.legalNote")}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
