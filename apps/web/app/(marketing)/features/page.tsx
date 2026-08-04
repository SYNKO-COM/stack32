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

import { useTranslation } from "@/hooks/use-translation";

const ICONS = [
  MessageSquareText,
  ShieldCheck,
  Wrench,
  Sparkles,
  LayoutList,
  GitBranch,
  FileSearch,
  Languages,
];

export default function FeaturesPage() {
  const { t } = useTranslation("marketing");
  const items = t("features.items", { returnObjects: true }) as {
    title: string;
    description: string;
  }[];

  return (
    <div className="mx-auto max-w-6xl px-6 pt-36 pb-24">
      <div className="mx-auto mb-16 max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {t("features.title")}
        </h1>
        <p className="mt-4 text-muted-foreground">{t("features.subtitle")}</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => {
          const Icon = ICONS[i % ICONS.length];
          return (
            <div key={item.title} className="glass rounded-3xl p-6">
              <span className="mb-4 flex size-10 items-center justify-center rounded-2xl bg-brand/15 text-brand">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h2 className="font-medium">{item.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
