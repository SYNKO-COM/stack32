"use client";

import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";

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

  const included = t("pricing.included.items", { returnObjects: true }) as string[];
  const billingFaq = t("pricing.faq.items", { returnObjects: true }) as {
    question: string;
    answer: string;
  }[];

  return (
    <div className="mx-auto max-w-4xl px-6 pt-36 pb-24">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("pricing.title")}
        </h1>
        <p className="mt-4 text-muted-foreground">{t("pricing.subtitle")}</p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground/90">
          {t("pricing.intro")}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              "relative flex flex-col rounded-[28px] border border-border/70 p-7",
              plan.id === "pro" && "border-brand/30 shadow-glow-sm",
            )}
          >
            {plan.badge ? (
              <Badge className="absolute -top-3 left-7 bg-brand text-white">{plan.badge}</Badge>
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
