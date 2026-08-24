"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import {
  PLAN_KEYS,
  PLANS,
  pricePlanSelection,
  type BillingInterval,
} from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

const PREVIEW_FEATURE_COUNT = 4;

function formatUsd(amount: number, locale: string): string {
  const rounded = Math.round(amount * 100) / 100;
  const hasCents = Math.abs(rounded % 1) > 1e-9;
  const formatted = new Intl.NumberFormat(locale.startsWith("fr") ? "fr-FR" : "en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(rounded);
  return locale.startsWith("fr") ? `${formatted} $` : `$${formatted}`;
}

function formatCredits(n: number, locale: string): string {
  return new Intl.NumberFormat(locale.startsWith("fr") ? "fr-FR" : "en-US").format(n);
}

export function PricingPlansPreview() {
  const { t, i18n } = useTranslation(["marketing", "common"]);
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const locale = i18n.language || "en";

  const plans = useMemo(
    () =>
      PLAN_KEYS.map((id) => {
        const priced = pricePlanSelection(id, interval, PLANS[id].baseCredits);
        const showAnnual = interval === "annual" && PLANS[id].monthlyPriceUsd > 0;
        const allFeatures = [
          ...(t(`marketing:pricing.${id}.features`, { returnObjects: true }) as string[]),
          t(`marketing:pricing.${id}.${PLANS[id].integrationsLabelKey}`),
        ];
        return {
          id,
          name: t(`marketing:pricing.${id}.name`),
          description: t(`marketing:pricing.${id}.description`),
          features: allFeatures.slice(0, PREVIEW_FEATURE_COUNT),
          badge: id === "pro" ? t("marketing:pricing.pro.badge") : null,
          popular: id === "pro",
          displayPrice: formatUsd(priced.displayMonthlyUsd, locale),
          strikethroughPrice: showAnnual ? formatUsd(priced.listMonthlyUsd, locale) : null,
          billedAnnuallyHint: showAnnual
            ? t("marketing:pricing.billedAnnually", {
                amount: formatUsd(priced.chargeUsd, locale),
              })
            : null,
          // Free's grant is one-time for the life of the account, so it must
          // not read "per month" — that promise is what made it look renewable.
          creditsLabel: t(
            PLANS[id].creditsRenew
              ? "marketing:pricing.creditsPerMonth"
              : "marketing:pricing.creditsLifetime",
            { count: formatCredits(priced.creditsMonthly, locale) },
          ),
        };
      }),
    [interval, locale, t],
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("marketing:pricingPreview.title")}
        </h2>
        <p className="mt-3 text-muted-foreground">{t("marketing:pricingPreview.subtitle")}</p>

        <div
          className="mt-8 inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 p-1"
          role="group"
          aria-label={t("marketing:pricing.billingToggleLabel")}
        >
          <button
            type="button"
            onClick={() => setInterval("monthly")}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              interval === "monthly"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={interval === "monthly"}
          >
            {t("marketing:pricing.monthly")}
          </button>
          <button
            type="button"
            onClick={() => setInterval("annual")}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              interval === "annual"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={interval === "annual"}
          >
            {t("marketing:pricing.annual")}
            <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-semibold text-brand">
              {t("marketing:pricing.annualSave")}
            </span>
          </button>
        </div>
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              "relative flex flex-col rounded-[28px] border border-border/70 bg-background/60 p-6 text-left",
              plan.popular && "border-brand/40 shadow-glow-sm xl:-mt-1 xl:mb-1 xl:p-7",
            )}
          >
            {plan.badge ? (
              <Badge className="absolute -top-3 left-6 bg-brand text-white">{plan.badge}</Badge>
            ) : null}
            <h3 className="text-lg font-medium">{plan.name}</h3>
            <p className="mt-1 min-h-[40px] text-sm text-muted-foreground">{plan.description}</p>
            <div className="mt-5">
              {plan.strikethroughPrice ? (
                <p className="mb-1 text-sm text-muted-foreground">
                  <span className="line-through opacity-70">{plan.strikethroughPrice}</span>
                  <span className="ml-2 text-xs font-medium text-brand">
                    {t("marketing:pricing.annualSave")}
                  </span>
                </p>
              ) : null}
              <p>
                <span className="text-4xl font-semibold tracking-tight">{plan.displayPrice}</span>
                {plan.id !== "free" ? (
                  <span className="text-sm text-muted-foreground">
                    {t("marketing:pricing.perMonth")}
                  </span>
                ) : null}
              </p>
              {plan.billedAnnuallyHint ? (
                <p className="mt-1.5 text-xs text-muted-foreground">{plan.billedAnnuallyHint}</p>
              ) : (
                <p className="mt-1.5 text-xs text-transparent select-none" aria-hidden="true">
                  —
                </p>
              )}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{plan.creditsLabel}</p>
            <ul className="mt-5 flex-1 space-y-2.5">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-10 text-center">
        <Button asChild size="lg" className="rounded-full">
          <Link href="/pricing">
            {t("marketing:pricingPreview.learnMore")}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
