"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useSubscription } from "@/hooks/use-billing";
import { useTranslation } from "@/hooks/use-translation";
import { USE_MOCK_DATA } from "@/lib/site";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";

export function BillingDialog() {
  const { t, i18n } = useTranslation(["billing", "common"]);
  const router = useRouter();
  const activeDialog = useUiStore((s) => s.activeDialog);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const { data: subscription } = useSubscription();

  const status = subscription?.status ?? "inactive";
  const renewDate = subscription?.currentPeriodEnd
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" }).format(
        new Date(subscription.currentPeriodEnd),
      )
    : null;

  const openPlans = () => {
    closeDialog();
    router.push("/billing/plans");
  };

  return (
    <Dialog open={activeDialog === "billing"} onOpenChange={(o) => (!o ? closeDialog() : undefined)}>
      <DialogContent className="glass-strong border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("billing:status.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("billing:status.planLabel")}</span>
            <span className="font-medium">{subscription?.planName ?? t("common:plan.free")}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("billing:status.statusLabel")}</span>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                status === "active" || status === "trialing"
                  ? "bg-emerald-500/10 text-emerald-300"
                  : "bg-foreground/5 text-muted-foreground",
              )}
            >
              {t(`billing:status.${status}`)}
            </span>
          </div>
          {renewDate ? (
            <p className="text-muted-foreground">
              {t("billing:status.renewsOn", { date: renewDate })}
            </p>
          ) : null}

          <Separator className="bg-border" />

          <Button className="w-full rounded-xl" variant="outline" onClick={openPlans}>
            {t("billing:status.manage")}
          </Button>

          {USE_MOCK_DATA ? (
            <p className="text-xs text-muted-foreground/70">{t("billing:status.mockNotice")}</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
