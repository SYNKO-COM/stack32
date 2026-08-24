"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { CreditSelect } from "@/components/billing/credit-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useActivatePlan } from "@/hooks/use-billing";
import { useCurrentUser } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import {
  creditOptionsForPlan,
  PLAN_KEYS,
  PLANS,
  pricePlanSelection,
  type BillingInterval,
  type PlanKey,
} from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";

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

export default function PricingPage() {
  const { t, i18n } = useTranslation("marketing");
  const openDialog = useUiStore((s) => s.openDialog);
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const activate = useActivatePlan();
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [creditByPlan, setCreditByPlan] = useState<Record<PlanKey, number>>({
    free: PLANS.free.baseCredits,
    starter: PLANS.starter.baseCredits,
    pro: PLANS.pro.baseCredits,
    scale: PLANS.scale.baseCredits,
  });
  const locale = i18n.language || "en";

  const plans = useMemo(
    () =>
      PLAN_KEYS.map((id) => {
        const credits = creditByPlan[id];
        const priced = pricePlanSelection(id, interval, credits);
        const showAnnual = interval === "annual" && PLANS[id].monthlyPriceUsd > 0;
        const featureItems = [
          ...(t(`pricing.${id}.features`, { returnObjects: true }) as string[]),
          t(`pricing.${id}.${PLANS[id].integrationsLabelKey}`),
        ];
        return {
          id,
          name: t(`pricing.${id}.name`),
          description: t(`pricing.${id}.description`),
          features: featureItems,
          cta: t(`pricing.${id}.cta`),
          badge: id === "pro" ? t("pricing.pro.badge") : null,
          popular: id === "pro",
          creditsMonthly: priced.creditsMonthly,
          creditOptions: creditOptionsForPlan(id),
          displayPrice: formatUsd(priced.displayMonthlyUsd, locale),
          strikethroughPrice: showAnnual ? formatUsd(priced.listMonthlyUsd, locale) : null,
          billedAnnuallyHint: showAnnual
            ? t("pricing.billedAnnually", {
                amount: formatUsd(priced.chargeUsd, locale),
              })
            : null,
          // Free's grant is one-time for the life of the account, so it must
          // not read "per month" — that promise is what made it look renewable.
          creditsLabel: t(
            PLANS[id].creditsRenew
              ? "pricing.creditsPerMonth"
              : "pricing.creditsLifetime",
            { count: formatCredits(priced.creditsMonthly, locale) },
          ),
        };
      }),
    [creditByPlan, interval, locale, t],
  );

  const included = t("pricing.included.items", { returnObjects: true }) as string[];
  const billingFaq = t("pricing.faq.items", { returnObjects: true }) as {
    question: string;
    answer: string;
  }[];

  const handleCta = async (planKey: PlanKey) => {
    if (planKey === "free") {
      if (!user) {
        openDialog("auth", { authMode: "signup" });
        return;
      }
      await activate.mutateAsync({
        planKey: "free",
        interval: "monthly",
        creditsMonthly: PLANS.free.baseCredits,
      });
      router.push("/agents");
      return;
    }

    const credits = creditByPlan[planKey];
    const qs = new URLSearchParams({
      plan: planKey,
      interval,
      credits: String(credits),
    });
    const checkoutPath = `/billing/checkout?${qs.toString()}`;

    if (!user) {
      openDialog("auth", { authMode: "signup", preferredNext: checkoutPath });
      return;
    }

    router.push(checkoutPath);
  };

  return (
    <div className="mx-auto max-w-6xl px-6 pt-36 pb-24">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("pricing.title")}
        </h1>
        <p className="mt-4 text-muted-foreground">{t("pricing.subtitle")}</p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground/90">
          {t("pricing.intro")}
        </p>

        <div
          className="mt-8 inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 p-1"
          role="group"
          aria-label={t("pricing.billingToggleLabel")}
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
            {t("pricing.monthly")}
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
            {t("pricing.annual")}
            <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-semibold text-brand">
              {t("pricing.annualSave")}
            </span>
          </button>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              "relative flex flex-col rounded-[28px] border border-border/70 p-6",
              plan.popular && "border-brand/40 shadow-glow-sm xl:-mt-1 xl:mb-1 xl:p-7",
            )}
          >
            {plan.badge ? (
              <Badge className="absolute -top-3 left-6 bg-brand text-white">{plan.badge}</Badge>
            ) : null}
            <h2 className="text-lg font-medium">{plan.name}</h2>
            <p className="mt-1 min-h-[40px] text-sm text-muted-foreground">{plan.description}</p>
            <div className="mt-5">
              {plan.strikethroughPrice ? (
                <p className="mb-1 text-sm text-muted-foreground">
                  <span className="line-through opacity-70">{plan.strikethroughPrice}</span>
                  <span className="ml-2 text-xs font-medium text-brand">
                    {t("pricing.annualSave")}
                  </span>
                </p>
              ) : null}
              <p>
                <span className="text-4xl font-semibold tracking-tight">{plan.displayPrice}</span>
                {plan.id !== "free" ? (
                  <span className="text-sm text-muted-foreground">{t("pricing.perMonth")}</span>
                ) : null}
              </p>
              {/* The annual-billing note keeps its line even when empty, so the
                  monthly cards do not jump when the toggle flips. That reserved
                  line plus the button's own margin is the whole gap under the
                  price — 16px + 4px — which matches the 20px above it. */}
              {plan.billedAnnuallyHint ? (
                <p className="h-4 text-xs text-muted-foreground">{plan.billedAnnuallyHint}</p>
              ) : (
                <p className="h-4 text-xs text-transparent select-none" aria-hidden="true">
                  —
                </p>
              )}
            </div>

            <Button
              className="mt-1 w-full rounded-full"
              variant={plan.popular ? "default" : "outline"}
              disabled={activate.isPending}
              onClick={() => void handleCta(plan.id)}
            >
              {plan.cta}
            </Button>
            {plan.id !== "free" ? (
              <div className="mt-5 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("pricing.creditsLabel")}
                </p>
                <CreditSelect
                  value={plan.creditsMonthly}
                  options={plan.creditOptions}
                  onChange={(credits) =>
                    setCreditByPlan((prev) => ({ ...prev, [plan.id]: credits }))
                  }
                  formatLabel={(n) =>
                    t("pricing.creditOption", { count: formatCredits(n, locale) })
                  }
                  needMoreLabel={t("pricing.needMoreCredits")}
                  onNeedMore={() => openDialog("auth", { authMode: "signup" })}
                />
                <p className="text-[11px] text-muted-foreground/80">{plan.creditsLabel}</p>
              </div>
            ) : (
              // Free has no credit picker. Its allowance sits on the same line
              // as the paid plans' label, and the rest of the picker's height
              // is reserved so the four feature lists start together.
              <div className="mt-5 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {plan.creditsLabel}
                </p>
                <p className="h-9 text-transparent select-none" aria-hidden="true">
                  —
                </p>
                <p
                  className="text-[11px] text-transparent select-none"
                  aria-hidden="true"
                >
                  —
                </p>
              </div>
            )}

            <ul className="mt-7 flex-1 space-y-2.5 border-t border-border/60 pt-6">
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

      <section className="mt-16">
        <h2 className="text-xl font-semibold tracking-tight">{t("pricing.included.title")}</h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {included.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-16">
        <h2 className="mb-6 text-xl font-semibold tracking-tight">{t("pricing.faq.title")}</h2>
        <div className="space-y-3">
          {billingFaq.map((item) => (
            <details key={item.question} className="rounded-2xl border border-border/60 px-5 py-4">
              <summary className="cursor-pointer list-none font-medium">{item.question}</summary>
              <p className="mt-3 text-sm text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <p className="mt-10 text-center text-xs text-muted-foreground/70">{t("pricing.note")}</p>
    </div>
  );
}
