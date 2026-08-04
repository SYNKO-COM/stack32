"use client";

import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { useUiStore } from "@/store/ui-store";
import { cn } from "@/lib/utils";

export default function PricingPage() {
  const { t } = useTranslation("marketing");
  const openDialog = useUiStore((s) => s.openDialog);

  const plans = (["free", "pro"] as const).map((id) => ({
    id,
    name: t(`pricing.${id}.name`),
    price: t(`pricing.${id}.price`),
    description: t(`pricing.${id}.description`),
    features: t(`pricing.${id}.features`, { returnObjects: true }) as string[],
    cta: t(`pricing.${id}.cta`),
    badge: id === "pro" ? t("pricing.pro.badge") : null,
  }));

  return (
    <div className="mx-auto max-w-4xl px-6 pt-36 pb-24">
      <div className="mx-auto mb-16 max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("pricing.title")}
        </h1>
        <p className="mt-4 text-muted-foreground">{t("pricing.subtitle")}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              "glass relative flex flex-col rounded-[28px] p-7",
              plan.id === "pro" && "glass-strong shadow-glow-sm border-brand/25",
            )}
          >
            {plan.badge ? (
              <Badge className="absolute -top-3 left-7 bg-brand text-white">
                {plan.badge}
              </Badge>
            ) : null}
            <h2 className="text-lg font-medium">{plan.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
            <p className="mt-5">
              <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
              <span className="text-sm text-muted-foreground">{t("pricing.perMonth")}</span>
            </p>
            <ul className="mt-6 flex-1 space-y-2.5">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
            <Button
              className="mt-8 w-full rounded-full"
              variant={plan.id === "pro" ? "default" : "outline"}
              onClick={() => openDialog("auth", { authMode: "signup" })}
            >
              {plan.cta}
            </Button>
          </div>
        ))}
      </div>

      <p className="mt-10 text-center text-xs text-muted-foreground/70">{t("pricing.note")}</p>
    </div>
  );
}
