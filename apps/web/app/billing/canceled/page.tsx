"use client";

import { CircleSlash } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";

export default function BillingCanceledPage() {
  const { t } = useTranslation("billing");

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <CircleSlash className="mb-6 size-14 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-3xl font-semibold tracking-tight">{t("canceled.title")}</h1>
      <p className="mt-3 text-muted-foreground">{t("canceled.subtitle")}</p>
      <Button asChild variant="outline" className="mt-8 rounded-full">
        <Link href="/agents">{t("canceled.cta")}</Link>
      </Button>
    </div>
  );
}
