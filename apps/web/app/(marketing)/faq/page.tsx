"use client";

import { useTranslation } from "@/hooks/use-translation";

export default function FaqPage() {
  const { t } = useTranslation("marketing");
  const items = t("faq.items", { returnObjects: true }) as {
    question: string;
    answer: string;
  }[];

  return (
    <div className="mx-auto max-w-3xl px-6 pt-36 pb-24">
      <div className="mb-14 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t("faq.title")}</h1>
        <p className="mt-4 text-muted-foreground">{t("faq.subtitle")}</p>
      </div>
      <div className="space-y-4">
        {items.map((item) => (
          <details key={item.question} className="glass rounded-2xl px-5 py-4">
            <summary className="cursor-pointer list-none font-medium">{item.question}</summary>
            <p className="mt-3 text-sm text-muted-foreground">{item.answer}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
