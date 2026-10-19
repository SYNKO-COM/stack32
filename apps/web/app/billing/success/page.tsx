"use client";

import { CircleCheck, CircleAlert, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { readCheckoutPayment } from "@/lib/actions/checkout-payment";
import { getMobileProject, launchMobileProject } from "@/lib/actions/mobile-onboarding";
import { MOBILE_RETURN } from "@/lib/onboarding/journey";

function BillingSuccessInner() {
  const { t } = useTranslation("billing");
  const params = useSearchParams();
  const router = useRouter();
  const paymentId = params.get("payment");
  const isTopUp = params.get("topup") === "1";
  const failed = ["failed", "canceled"].includes(params.get("status") ?? "");
  const [paid, setPaid] = useState(false);
  const [polling, setPolling] = useState(!failed);
  const [mobile, setMobile] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => { void getMobileProject().then(({ project }) => setMobile(Boolean(project && project.status !== "launched"))).catch(() => {}); }, []);

  useEffect(() => {
    if (failed) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        // URL and browser completion callbacks never grant access or prove a sale.
        const verified = paymentId ? await readCheckoutPayment(paymentId) : null;
        const res = !isTopUp ? await fetch("/api/billing/refresh", { method: "POST" }) : null;
        const subscription = res?.ok ? await res.json() as { paid?: boolean } : null;
        if (cancelled) return;
        if (!isTopUp) {
          const current = await getMobileProject();
          if (cancelled) return;
          if (current.project && ["ready", "launched"].includes(current.project.status) && current.paid) {
            const result = await launchMobileProject();
            if (!cancelled && result.path) { router.replace(result.path); return; }
          }
          if (current.project && current.project.status !== "launched") {
            // A successful payment URL (or payment preceding its webhook) cannot
            // skip the server's active entitlement check.
            if (attempts >= 8) { setPolling(false); return; }
            timer = setTimeout(() => void tick(), 1500); return;
          }
        }
        if (verified?.paid || (!paymentId && !isTopUp && subscription?.paid)) {
          setPaid(true); setPolling(false); return;
        }
      } catch { /* transient errors leave the outcome unconfirmed */ }
      if (cancelled) return;
      if (attempts >= 8) { setPolling(false); return; }
      timer = setTimeout(() => void tick(), 1500);
    };
    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [failed, paymentId, isTopUp, retry, router]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      {paid ? <CircleCheck className="mb-6 size-14 text-emerald-500" aria-hidden="true" /> : polling ? <Loader2 className="mb-6 size-12 animate-spin text-brand" aria-hidden="true" /> : <CircleAlert className="mb-6 size-12 text-muted-foreground" aria-hidden="true" />}
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t(paid ? (isTopUp ? "success.topupTitle" : "success.title") : failed ? "success.failedTitle" : "success.pendingTitle")}</h1>
      <p className="mt-3 max-w-lg text-muted-foreground" role="status">{t(paid ? "success.verified" : failed ? "success.failedBody" : "success.pendingBody")}</p>
      {mobile && !failed && !polling && !paid && <Button className="mt-6 rounded-full" onClick={() => { setPolling(true); setRetry(n => n + 1); }}>{t("common:actions.retry")}</Button>}
      <Button asChild className="mt-8 rounded-full"><Link href={mobile ? MOBILE_RETURN : failed ? "/billing/plans" : "/agents"}>{mobile ? t("success.backToAgent", { defaultValue: "Revenir à mon agent" }) : t(failed ? "checkout.backToPricing" : "success.cta")}</Link></Button>
    </div>
  );
}
export default function BillingSuccessPage() {
  return <Suspense fallback={<div className="flex flex-1 items-center justify-center py-12"><Loader2 className="size-5 animate-spin" aria-label="Loading" /></div>}><BillingSuccessInner /></Suspense>;
}
