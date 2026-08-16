"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WhopCheckoutEmbed } from "@whop/checkout/react";
import { Trans } from "react-i18next";

import { Button } from "@/components/ui/button";
import { createWhopCheckoutSession } from "@/lib/actions/billing";
import type { BillingInterval, PlanKey } from "@/lib/billing/plans";
import { pricePlanSelection } from "@/lib/billing/plans";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

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
          "mt-0.5 size-4 shrink-0 cursor-pointer appearance-none rounded-full border border-border bg-background",
          "checked:border-brand checked:bg-brand checked:shadow-[inset_0_0_0_3px_hsl(var(--background))]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
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
  const { t, i18n } = useTranslation("billing");
  const router = useRouter();
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedImmediate, setAcceptedImmediate] = useState(false);
  const [consentsConfirmed, setConsentsConfirmed] = useState(false);
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

  useEffect(() => {
    if (!consentsConfirmed) return;
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
  }, [consentsConfirmed, planKey, interval, creditsMonthly]);

  const site =
    typeof window !== "undefined" ? window.location.origin : "https://stack32.com";

  return (
    <div className="mx-auto w-full max-w-lg px-6 py-16">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t("checkout.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("checkout.subtitle", {
            plan: planKey.charAt(0).toUpperCase() + planKey.slice(1),
            credits: creditsMonthly,
            amount: amountLabel,
            period: interval === "annual" ? t("checkout.perYear") : t("checkout.perMonth"),
          })}
        </p>
      </div>

      <div className="mb-6 space-y-3 rounded-[24px] border border-border/70 bg-background/80 p-5 shadow-glow-sm">
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
          {t("checkout.consents.immediate")}
        </ConsentCheckbox>

        {!consentsConfirmed ? (
          <Button
            className="mt-2 w-full rounded-full"
            disabled={!canProceed}
            onClick={() => setConsentsConfirmed(true)}
          >
            {t("checkout.continueToPayment", { amount: amountLabel })}
          </Button>
        ) : null}

        <p className="text-[11px] leading-relaxed text-muted-foreground/80">
          {t("checkout.consents.legalNote")}
        </p>
      </div>

      {loading ? (
        <p className="text-center text-sm text-muted-foreground">{t("checkout.loading")}</p>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium">{t("checkout.errorTitle")}</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button asChild className="mt-4 rounded-full" variant="outline">
            <Link href="/pricing">{t("checkout.backToPricing")}</Link>
          </Button>
        </div>
      ) : null}

      {sessionId && consentsConfirmed ? (
        <div className="overflow-hidden rounded-[28px] border border-border/70 bg-background shadow-glow-sm">
          <WhopCheckoutEmbed
            sessionId={sessionId}
            theme="system"
            returnUrl={`${site}/billing/success`}
            setupFutureUsage="off_session"
            onComplete={() => {
              router.push("/billing/success");
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
