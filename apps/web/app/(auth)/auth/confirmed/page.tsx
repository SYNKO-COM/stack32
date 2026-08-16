"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { resolvePostAuthPath } from "@/lib/auth/post-auth";
import { AuthCompactCard } from "@/components/auth/auth-compact-card";

const AUTO_REDIRECT_MS = 5000;

function ConfirmedContent() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(AUTO_REDIRECT_MS / 1000));
  const [destination, setDestination] = useState("/agents");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const path = await resolvePostAuthPath(searchParams.get("next"));
      if (!cancelled) setDestination(path);
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  useEffect(() => {
    const started = Date.now();
    const tick = window.setInterval(() => {
      const remaining = Math.max(0, AUTO_REDIRECT_MS - (Date.now() - started));
      setSecondsLeft(Math.ceil(remaining / 1000));
      if (remaining <= 0) {
        window.clearInterval(tick);
        router.replace(destination);
      }
    }, 250);
    return () => window.clearInterval(tick);
  }, [destination, router]);

  return (
    <AuthCompactCard className="text-center">
      <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
        <CheckCircle2 className="size-7" aria-hidden="true" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">{t("confirmed.title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("confirmed.subtitle")}</p>
      <p className="mt-4 text-xs text-muted-foreground/80">
        {t("confirmed.redirecting", { seconds: secondsLeft })}
      </p>
      <Button asChild className="mt-8 w-full rounded-xl">
        <Link href={destination}>{t("confirmed.cta")}</Link>
      </Button>
      <p className="mt-4 text-sm">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          {t("confirmed.home")}
        </Link>
      </p>
    </AuthCompactCard>
  );
}

export default function AuthConfirmedPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmedContent />
    </Suspense>
  );
}
