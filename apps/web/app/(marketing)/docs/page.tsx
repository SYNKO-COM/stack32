"use client";

import { BookOpen } from "lucide-react";

import { useTranslation } from "@/hooks/use-translation";

export default function DocsPage() {
  const { t } = useTranslation("marketing");
  const sections = t("docs.sections", { returnObjects: true }) as {
    title: string;
    description: string;
  }[];

  return (
    <div className="mx-auto max-w-6xl px-6 pt-36 pb-24">
      <div className="mx-auto mb-16 max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t("docs.title")}</h1>
        <p className="mt-4 text-muted-foreground">{t("docs.subtitle")}</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <div key={section.title} className="glass rounded-3xl p-6">
            <BookOpen className="mb-4 size-5 text-brand" aria-hidden="true" />
            <h2 className="font-medium">{section.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{section.description}</p>
          </div>
        ))}
      </div>
      <p className="mt-12 text-center text-sm text-muted-foreground/70">
        {t("docs.comingSoon")}
      </p>
    </div>
  );
}
