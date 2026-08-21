"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useCancelSubscription, useResumeSubscription, useSubscription } from "@/hooks/use-billing";
import { useTranslation } from "@/hooks/use-translation";
import { USE_MOCK_DATA } from "@/lib/site";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";

function formatMoney(amount: number | undefined, locale: string): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  const rounded = Math.round(amount * 100) / 100;
  const formatted = new Intl.NumberFormat(locale.startsWith("fr") ? "fr-FR" : "en-US", {
    minimumFractionDigits: rounded % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rounded);
  return locale.startsWith("fr") ? `${formatted} $` : `$${formatted}`;
}

function formatDate(iso: string | undefined, locale: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(d);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium break-all">{value}</span>
    </div>
  );
}

export function BillingDialog() {
  const { t, i18n } = useTranslation(["billing", "common"]);
  const router = useRouter();
  const activeDialog = useUiStore((s) => s.activeDialog);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const { data: subscription } = useSubscription();
  const cancelSub = useCancelSubscription();
  const resumeSub = useResumeSubscription();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const locale = i18n.language || "en";
  const status = subscription?.status ?? "inactive";
  const planKey = subscription?.planKey ?? "free";
  const isPaid =
    planKey !== "free" && (status === "active" || status === "trialing");
  const cancelAtPeriodEnd = Boolean(subscription?.cancelAtPeriodEnd);
  const busy = pending || cancelSub.isPending || resumeSub.isPending;

  const periodStart = formatDate(subscription?.currentPeriodStart, locale);
  const periodEnd = formatDate(subscription?.currentPeriodEnd, locale);
  const pricePaid = formatMoney(subscription?.pricePaidUsd, locale);
  const nextPrice = formatMoney(
    cancelAtPeriodEnd ? 0 : subscription?.nextPriceUsd,
    locale,
  );
  const intervalLabel =
    subscription?.billingInterval === "annual"
      ? t("billing:status.intervalAnnual")
      : t("billing:status.intervalMonthly");

  const openPlans = () => {
    closeDialog();
    router.push("/billing/plans");
  };

  const onCancel = () => {
    setActionError(null);
    startTransition(async () => {
      const result = await cancelSub.mutateAsync();
      if (!result.ok) {
        setActionError(t("billing:status.cancelError"));
        return;
      }
      setConfirmCancel(false);
    });
  };

  const onResume = () => {
    setActionError(null);
    startTransition(async () => {
      const result = await resumeSub.mutateAsync();
      if (!result.ok) {
        setActionError(t("billing:status.resumeError"));
      }
    });
  };

  return (
    <Dialog
      open={activeDialog === "billing"}
      onOpenChange={(o) => {
        if (!o) {
          setConfirmCancel(false);
          setActionError(null);
          closeDialog();
        }
      }}
    >
      <DialogContent className="glass-strong border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("billing:status.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <DetailRow
            label={t("billing:status.planLabel")}
            value={subscription?.planName ?? t("common:plan.free")}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{t("billing:status.statusLabel")}</span>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                status === "active" || status === "trialing"
                  ? cancelAtPeriodEnd
                    ? "bg-amber-500/10 text-amber-800 dark:text-amber-200"
                    : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "bg-foreground/5 text-muted-foreground",
              )}
            >
              {cancelAtPeriodEnd && (status === "active" || status === "trialing")
                ? t("billing:status.canceling")
                : t(`billing:status.${status}`)}
            </span>
          </div>

          {isPaid ? (
            <>
              <DetailRow label={t("billing:status.intervalLabel")} value={intervalLabel} />
              {subscription?.membershipId ? (
                <DetailRow
                  label={t("billing:status.membershipId")}
                  value={subscription.membershipId}
                />
              ) : null}
              {subscription?.providerPlanId ? (
                <DetailRow
                  label={t("billing:status.planId")}
                  value={subscription.providerPlanId}
                />
              ) : null}
              {periodStart ? (
                <DetailRow label={t("billing:status.firstBilled")} value={periodStart} />
              ) : null}
              {pricePaid ? (
                <DetailRow label={t("billing:status.pricePaid")} value={pricePaid} />
              ) : null}
              {nextPrice != null ? (
                <DetailRow
                  label={t("billing:status.nextPrice")}
                  value={
                    cancelAtPeriodEnd
                      ? t("billing:status.nextPriceNone")
                      : nextPrice
                  }
                />
              ) : null}
              {periodEnd ? (
                <p className="text-muted-foreground">
                  {cancelAtPeriodEnd
                    ? t("billing:status.endsOn", { date: periodEnd })
                    : t("billing:status.renewsOn", { date: periodEnd })}
                </p>
              ) : null}
            </>
          ) : null}

          {cancelAtPeriodEnd && periodEnd ? (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
              {t("billing:status.cancelNotice", { date: periodEnd })}
            </p>
          ) : null}

          {actionError ? <p className="text-xs text-destructive">{actionError}</p> : null}

          <Separator className="bg-border" />

          <Button className="w-full rounded-xl" variant="outline" onClick={openPlans}>
            {t("billing:status.changePlan")}
          </Button>

          {isPaid && !cancelAtPeriodEnd ? (
            confirmCancel ? (
              <div className="space-y-2 rounded-xl border border-border/70 p-3">
                <p className="text-xs text-muted-foreground">
                  {t("billing:status.cancelConfirm", {
                    date: periodEnd ?? "—",
                  })}
                </p>
                <div className="flex gap-2">
                  <Button
                    className="flex-1 rounded-xl"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setConfirmCancel(false)}
                  >
                    {t("billing:status.keepSubscription")}
                  </Button>
                  <Button
                    className="flex-1 rounded-xl"
                    variant="destructive"
                    disabled={busy}
                    onClick={onCancel}
                  >
                    {busy ? t("billing:status.cancelingAction") : t("billing:status.confirmCancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                className="w-full rounded-xl"
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirmCancel(true)}
              >
                {t("billing:status.cancelSubscription")}
              </Button>
            )
          ) : null}

          {isPaid && cancelAtPeriodEnd ? (
            <Button
              className="w-full rounded-xl"
              variant="secondary"
              disabled={busy}
              onClick={onResume}
            >
              {busy ? t("billing:status.resuming") : t("billing:status.resumeSubscription")}
            </Button>
          ) : null}

          {USE_MOCK_DATA ? (
            <p className="text-xs text-muted-foreground/70">{t("billing:status.mockNotice")}</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
