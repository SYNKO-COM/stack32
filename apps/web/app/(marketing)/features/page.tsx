"use client";

import {
  FileSearch,
  GitBranch,
  Languages,
  LayoutList,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useStartFromPrompt } from "@/hooks/use-start-from-prompt";
import { useTranslation } from "@/hooks/use-translation";

const CAPABILITY_ICONS = [
  MessageSquareText,
  ShieldCheck,
  Wrench,
  Sparkles,
  LayoutList,
  GitBranch,
  FileSearch,
  Languages,
];

type TextItem = { title: string; description: string };

export default function ProductPage() {
  const { t } = useTranslation("marketing");
  const startFromPrompt = useStartFromPrompt();
  const examples = t("hero.promptExamples", { returnObjects: true }) as string[];

  const lifecycle = t("features.lifecycle.items", { returnObjects: true }) as TextItem[];
  const capabilities = t("features.capabilities.items", { returnObjects: true }) as TextItem[];
  const usecases = t("features.usecases.items", { returnObjects: true }) as TextItem[];
  const trust = t("features.trust.items", { returnObjects: true }) as TextItem[];

  return (
    <div className="mx-auto max-w-6xl px-6 pt-36 pb-24">
      <div className="mx-auto mb-16 max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {t("features.title")}
        </h1>
        <p className="mt-4 text-muted-foreground text-pretty">{t("features.subtitle")}</p>
      </div>

      <section className="mx-auto mb-20 max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight">{t("features.intro.title")}</h2>
        <p className="mt-4 text-muted-foreground leading-relaxed">{t("features.intro.body")}</p>
      </section>

      <section className="mb-20">
        <div className="mb-10 max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("features.lifecycle.title")}
          </h2>
          <p className="mt-3 text-muted-foreground">{t("features.lifecycle.subtitle")}</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {lifecycle.map((item, i) => (
            <div key={item.title} className="border-t border-brand/30 pt-5">
              <p className="font-mono text-xs text-muted-foreground/60">0{i + 1}</p>
              <h3 className="mt-2 text-lg font-medium">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-20">
        <div className="mb-10 max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("features.capabilities.title")}
          </h2>
          <p className="mt-3 text-muted-foreground">{t("features.capabilities.subtitle")}</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {capabilities.map((item, i) => {
            const Icon = CAPABILITY_ICONS[i % CAPABILITY_ICONS.length];
            return (
              <div key={item.title} className="rounded-2xl border border-border/60 p-5">
                <span className="mb-3 flex size-9 items-center justify-center rounded-xl bg-brand/15 text-brand">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <h3 className="font-medium">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-20">
        <div className="mb-10 max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("features.usecases.title")}
          </h2>
          <p className="mt-3 text-muted-foreground">{t("features.usecases.subtitle")}</p>
        </div>
        <div className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
          {usecases.map((item) => (
            <div key={item.title} className="border-l border-brand/30 pl-5">
              <h3 className="font-medium">{item.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-20">
        <div className="mb-10 max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("features.trust.title")}
          </h2>
          <p className="mt-3 text-muted-foreground">{t("features.trust.subtitle")}</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {trust.map((item) => (
            <div key={item.title}>
              <h3 className="font-medium">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("features.cta.title")}
        </h2>
        <p className="mt-3 text-muted-foreground">{t("features.cta.subtitle")}</p>
        <Button
          size="lg"
          className="mt-8 rounded-full"
          onClick={() => void startFromPrompt(examples[0] ?? "")}
        >
          {t("features.cta.button")}
        </Button>
      </section>
    </div>
  );
}
