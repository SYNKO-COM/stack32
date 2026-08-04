"use client";

import { CircleSlash } from "lucide-react";
import Link from "next/link";

import { AnimatedBackground } from "@/components/shared/animated-background";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";

export default function BillingCanceledPage() {
  const { t } = useTranslation("billing");

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <AnimatedBackground variant="soft" />
      <CircleSlash className="mb-6 size-14 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-3xl font-semibold tracking-tight">{t("canceled.title")}</h1>
      <p className="mt-3 text-muted-foreground">{t("canceled.subtitle")}</p>
      <Button asChild variant="outline" className="mt-8 rounded-full">
        <Link href="/agents">{t("canceled.cta")}</Link>
      </Button>
    </div>
  );
}
