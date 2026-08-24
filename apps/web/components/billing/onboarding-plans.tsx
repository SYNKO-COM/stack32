"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { CreditSelect } from "@/components/billing/credit-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useActivatePlan, useSubscription } from "@/hooks/use-billing";
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

const PAID_PLAN_KEYS = PLAN_KEYS.filter((key): key is Exclude<PlanKey, "free"> => key !== "free");

const PLAN_RANK: Record<PlanKey, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  scale: 3,
};

/**
 * Post-onboarding paywall: paid plans only, plus a small free CTA underneath.
 * When the user already has a paid plan, the current tier is marked and locked.
 */
export function OnboardingPlans() {
  const { t, i18n } = useTranslation(["billing", "marketing"]);
  const router = useRouter();
  const activate = useActivatePlan();
  const { data: subscription } = useSubscription();
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [creditByPlan, setCreditByPlan] = useState<Record<Exclude<PlanKey, "free">, number>>({
    starter: PLANS.starter.baseCredits,
    pro: PLANS.pro.baseCredits,
    scale: PLANS.scale.baseCredits,
  });
  const locale = i18n.language || "en";

  const currentPlanKey: PlanKey =
    subscription?.planKey && PLAN_KEYS.includes(subscription.planKey)
      ? subscription.planKey
      : "free";
  const hasPaidPlan =
    (subscription?.status === "active" || subscription?.status === "trialing") &&
    currentPlanKey !== "free";

  const plans = useMemo(
    () =>
      PAID_PLAN_KEYS.map((id) => {
        const credits = creditByPlan[id];
        const priced = pricePlanSelection(id, interval, credits);
        const showAnnual = interval === "annual";
        const featureItems = t(`marketing:pricing.${id}.features`, { returnObjects: true });
        const features = [
          ...(Array.isArray(featureItems) ? featureItems : []),
          t(`marketing:pricing.${id}.${PLANS[id].integrationsLabelKey}`),
        ];
        const isCurrent = hasPaidPlan && id === currentPlanKey;
        const isUpgrade = hasPaidPlan && PLAN_RANK[id] > PLAN_RANK[currentPlanKey];
        const isDowngrade = hasPaidPlan && PLAN_RANK[id] < PLAN_RANK[currentPlanKey];
        return {
          id,
          name: t(`marketing:pricing.${id}.name`),
          description: t(`marketing:pricing.${id}.description`),
          features,
          cta: isCurrent
            ? t("billing:plans.currentPlan")
            : isUpgrade
              ? t("billing:plans.upgradeTo", { plan: t(`marketing:pricing.${id}.name`) })
              : isDowngrade
                ? t("billing:plans.downgradeTo", { plan: t(`marketing:pricing.${id}.name`) })
                : t(`marketing:pricing.${id}.cta`),
          badge: isCurrent
            ? t("billing:plans.currentPlan")
            : id === "pro"
              ? t("marketing:pricing.pro.badge")
              : null,
          popular: id === "pro" && !isCurrent,
          isCurrent,
          isDowngrade,
          creditsMonthly: priced.creditsMonthly,
          creditOptions: creditOptionsForPlan(id),
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
    [creditByPlan, currentPlanKey, hasPaidPlan, interval, locale, t],
  );

  const goCheckout = (planKey: Exclude<PlanKey, "free">) => {
    if (hasPaidPlan && planKey === currentPlanKey) return;
    const qs = new URLSearchParams({
      plan: planKey,
      interval,
      credits: String(creditByPlan[planKey]),
    });
    router.push(`/billing/checkout?${qs.toString()}`);
  };

  const startFree = async () => {
    if (hasPaidPlan) return;
    await activate.mutateAsync({
      planKey: "free",
      interval: "monthly",
      creditsMonthly: PLANS.free.baseCredits,
    });
    router.push("/agents");
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 md:py-16">
      <div className="mx-auto mb-8 max-w-2xl text-center sm:mb-10">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
          {t("billing:plans.title")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground sm:mt-4 sm:text-base">
          {hasPaidPlan ? t("billing:plans.subtitleManage") : t("billing:plans.subtitle")}
        </p>

        <div
          className="mt-6 inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 p-1 sm:mt-8"
          role="group"
          aria-label={t("marketing:pricing.billingToggleLabel")}
        >
          <button
            type="button"
            onClick={() => setInterval("monthly")}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors sm:px-4",
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
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors sm:px-4",
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

      <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              "relative flex flex-col rounded-[22px] border border-border/70 bg-background/70 p-5 sm:rounded-[28px] sm:p-6",
              plan.popular && "border-brand/40 shadow-glow-sm lg:-mt-1 lg:mb-1 lg:p-7",
              plan.isCurrent && "border-brand/50 ring-1 ring-brand/30",
            )}
          >
            {plan.badge ? (
              <Badge
                className={cn(
                  "absolute -top-3 left-5 sm:left-6",
                  plan.isCurrent ? "bg-foreground text-background" : "bg-brand text-white",
                )}
              >
                {plan.badge}
              </Badge>
            ) : null}
            <h2 className="text-lg font-medium">{plan.name}</h2>
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
                <span className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  {plan.displayPrice}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t("marketing:pricing.perMonth")}
                </span>
              </p>
              {plan.billedAnnuallyHint ? (
                <p className="mt-1.5 text-xs text-muted-foreground">{plan.billedAnnuallyHint}</p>
              ) : (
                <p className="mt-1.5 text-xs text-transparent select-none" aria-hidden="true">
                  —
                </p>
              )}
            </div>

            <div className="mt-4 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                {t("marketing:pricing.creditsLabel")}
              </p>
              <CreditSelect
                value={plan.creditsMonthly}
                options={plan.creditOptions}
                onChange={(credits) =>
                  setCreditByPlan((prev) => ({ ...prev, [plan.id]: credits }))
                }
                formatLabel={(n) =>
                  t("marketing:pricing.creditOption", { count: formatCredits(n, locale) })
                }
                needMoreLabel={t("marketing:pricing.needMoreCredits")}
                disabled={plan.isCurrent}
              />
              <p className="text-[11px] text-muted-foreground/80">{plan.creditsLabel}</p>
            </div>

            <ul className="mt-6 flex-1 space-y-2.5">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Button
              className="mt-8 w-full rounded-full"
              variant={plan.isCurrent ? "secondary" : plan.popular ? "default" : "outline"}
              disabled={activate.isPending || plan.isCurrent}
              onClick={() => goCheckout(plan.id)}
            >
              {plan.cta}
            </Button>
            {plan.isDowngrade ? (
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                {t("billing:plans.downgradeHint")}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {!hasPaidPlan ? (
        <div className="mt-8 text-center sm:mt-10">
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
            disabled={activate.isPending}
            onClick={() => void startFree()}
          >
            {t("billing:plans.startFree")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
