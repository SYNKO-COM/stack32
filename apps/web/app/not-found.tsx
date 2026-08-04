"use client";

import Link from "next/link";

import { AnimatedBackground } from "@/components/shared/animated-background";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";

export default function NotFound() {
  const { t } = useTranslation("errors");

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <AnimatedBackground variant="soft" />
      <Logo href="/" className="mb-8" />
      <h1 className="text-4xl font-semibold tracking-tight">{t("notFound.title")}</h1>
      <p className="mt-3 text-muted-foreground">{t("notFound.subtitle")}</p>
      <Button asChild className="mt-8 rounded-full">
        <Link href="/">{t("notFound.cta")}</Link>
      </Button>
    </div>
  );
}
