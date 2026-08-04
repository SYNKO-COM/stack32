"use client";

import { CircleCheck } from "lucide-react";
import Link from "next/link";

import { AnimatedBackground } from "@/components/shared/animated-background";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";

export default function BillingSuccessPage() {
  const { t } = useTranslation("billing");

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <AnimatedBackground variant="soft" />
      <CircleCheck className="mb-6 size-14 text-emerald-400" aria-hidden="true" />
      <h1 className="text-3xl font-semibold tracking-tight">{t("success.title")}</h1>
      <p className="mt-3 text-muted-foreground">{t("success.subtitle")}</p>
      <Button asChild className="mt-8 rounded-full">
        <Link href="/agents">{t("success.cta")}</Link>
      </Button>
    </div>
  );
}
