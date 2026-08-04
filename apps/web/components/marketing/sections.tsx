"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  FileText,
  MessageSquareText,
  Search,
  Sparkles,
  Wand2,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useStartFromPrompt } from "@/hooks/use-start-from-prompt";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

interface Item {
  name?: string;
  title?: string;
  description: string;
  question?: string;
  answer?: string;
}

function SectionShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.section
      initial={reducedMotion ? undefined : { opacity: 0, y: 32 }}
      whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className={cn("mx-auto max-w-6xl px-6 py-20", className)}
    >
      {children}
    </motion.section>
  );
}

export function HowItWorks() {
  const { t } = useTranslation("marketing");
  const steps = [
    { key: "describe", icon: MessageSquareText },
    { key: "build", icon: Wand2 },
    { key: "run", icon: Sparkles },
  ] as const;

  return (
    <SectionShell>
      <div className="mb-12 text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("howItWorks.title")}
        </h2>
        <p className="mt-3 text-muted-foreground">{t("howItWorks.subtitle")}</p>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {steps.map(({ key, icon: Icon }, i) => (
          <div key={key} className="glass rounded-3xl p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-brand/15 text-brand">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="font-mono text-xs text-muted-foreground/60">0{i + 1}</span>
            </div>
            <h3 className="text-lg font-medium">{t(`howItWorks.${key}.title`)}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(`howItWorks.${key}.description`)}
            </p>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

const AGENT_ICONS = [Search, Bot, FileText, Sparkles];

export function ExampleAgents() {
  const { t } = useTranslation("marketing");
  const items = t("exampleAgents.items", { returnObjects: true }) as Item[];

  return (
    <SectionShell>
      <div className="mb-12 text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("exampleAgents.title")}
        </h2>
        <p className="mt-3 text-muted-foreground">{t("exampleAgents.subtitle")}</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {items.map((item, i) => {
          const Icon = AGENT_ICONS[i % AGENT_ICONS.length];
          return (
            <div key={item.name} className="glass flex items-start gap-4 rounded-3xl p-6">
              <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-foreground/5 text-foreground/80">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-medium">{item.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-8 text-center">
        <Button asChild variant="ghost" className="gap-1.5">
          <Link href="/features">
            {t("features.exploreCta")}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </SectionShell>
  );
}

export function Benefits() {
  const { t } = useTranslation("marketing");
  const items = t("benefits.items", { returnObjects: true }) as Item[];

  return (
    <SectionShell>
      <h2 className="mb-12 text-center text-3xl font-semibold tracking-tight sm:text-4xl">
        {t("benefits.title")}
      </h2>
      <div className="grid gap-x-12 gap-y-8 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.title} className="border-l border-brand/30 pl-5">
            <h3 className="font-medium">{item.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{item.description}</p>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

export function FaqPreview() {
  const { t } = useTranslation("marketing");
  const items = t("faqPreview.items", { returnObjects: true }) as Item[];

  return (
    <SectionShell className="max-w-3xl">
      <h2 className="mb-10 text-center text-3xl font-semibold tracking-tight sm:text-4xl">
        {t("faqPreview.title")}
      </h2>
      <div className="space-y-4">
        {items.map((item) => (
          <details key={item.question} className="glass group rounded-2xl px-5 py-4">
            <summary className="cursor-pointer list-none font-medium marker:hidden">
              {item.question}
            </summary>
            <p className="mt-3 text-sm text-muted-foreground">{item.answer}</p>
          </details>
        ))}
      </div>
      <div className="mt-8 text-center">
        <Button asChild variant="ghost" className="gap-1.5">
          <Link href="/faq">
            {t("faq.title")}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </SectionShell>
  );
}

export function PricingPreview() {
  const { t } = useTranslation(["marketing", "common"]);

  return (
    <SectionShell className="max-w-4xl text-center">
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {t("marketing:pricingPreview.title")}
      </h2>
      <p className="mt-3 text-muted-foreground">{t("marketing:pricingPreview.subtitle")}</p>
      <div className="mt-8">
        <Button asChild size="lg" className="rounded-full">
          <Link href="/pricing">{t("common:nav.pricing")}</Link>
        </Button>
      </div>
    </SectionShell>
  );
}

export function FinalCta() {
  const { t } = useTranslation("marketing");
  const startFromPrompt = useStartFromPrompt();
  const examples = t("hero.promptExamples", { returnObjects: true }) as string[];

  return (
    <SectionShell className="max-w-3xl text-center">
      <div className="glass-strong shadow-glow-sm rounded-[32px] px-8 py-12">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("finalCta.title")}
        </h2>
        <p className="mt-3 text-muted-foreground">{t("finalCta.subtitle")}</p>
        <Button
          size="lg"
          className="mt-8 rounded-full"
          onClick={() => void startFromPrompt(examples[0] ?? "")}
        >
          {t("finalCta.cta")}
        </Button>
      </div>
    </SectionShell>
  );
}
