"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";

type FaqItem = { question: string; answer: string };
type FaqGroup = { title: string; items: FaqItem[] };

export default function FaqPage() {
  const { t } = useTranslation("marketing");
  const groups = t("faq.groups", { returnObjects: true }) as FaqGroup[];

  return (
    <div className="mx-auto max-w-3xl px-6 pt-36 pb-24">
      <div className="mb-14 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t("faq.title")}</h1>
        <p className="mt-4 text-muted-foreground text-pretty">{t("faq.subtitle")}</p>
      </div>

      <div className="space-y-12">
        {groups.map((group) => (
          <section key={group.title}>
            <h2 className="mb-4 text-lg font-semibold tracking-tight">{group.title}</h2>
            <div className="space-y-3">
              {group.items.map((item) => (
                <details key={item.question} className="rounded-2xl border border-border/60 px-5 py-4">
                  <summary className="cursor-pointer list-none font-medium">{item.question}</summary>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-14 border-t border-border pt-10 text-center">
        <p className="text-sm text-muted-foreground">{t("contact.subtitle")}</p>
        <Button asChild className="mt-4 rounded-full">
          <Link href="/contact">{t("contact.title")}</Link>
        </Button>
      </div>
    </div>
  );
}
