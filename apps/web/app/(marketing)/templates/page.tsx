"use client";

import { ArrowRight, Bot, FileText, LineChart, Search, Star, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useStartFromPrompt } from "@/hooks/use-start-from-prompt";
import { useTranslation } from "@/hooks/use-translation";

const ICONS = [Search, LineChart, FileText, Bot, Star, Users];

export default function TemplatesPage() {
  const { t } = useTranslation("marketing");
  const startFromPrompt = useStartFromPrompt();
  const items = t("templates.items", { returnObjects: true }) as {
    name: string;
    description: string;
    prompt: string;
  }[];

  return (
    <div className="mx-auto max-w-6xl px-6 pt-36 pb-24">
      <div className="mx-auto mb-16 max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {t("templates.title")}
        </h1>
        <p className="mt-4 text-muted-foreground">{t("templates.subtitle")}</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => {
          const Icon = ICONS[i % ICONS.length];
          return (
            <div key={item.name} className="glass flex flex-col rounded-3xl p-6">
              <span className="mb-4 flex size-10 items-center justify-center rounded-2xl bg-foreground/5 text-foreground/80">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h2 className="font-medium">{item.name}</h2>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{item.description}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-4 justify-start gap-1.5 self-start px-0 text-brand hover:bg-transparent hover:text-brand-from"
                onClick={() => void startFromPrompt(item.prompt)}
              >
                {t("templates.useTemplate")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
