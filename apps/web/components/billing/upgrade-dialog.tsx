"use client";

import { Check, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateCheckout } from "@/hooks/use-billing";
import { useTranslation } from "@/hooks/use-translation";
import { WHOP_PLAN_ID } from "@/lib/billing/whop";
import { useUiStore } from "@/store/ui-store";

export function UpgradeDialog() {
  const { t } = useTranslation("billing");
  const router = useRouter();
  const activeDialog = useUiStore((s) => s.activeDialog);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const checkout = useCreateCheckout();

  const features = t("upgrade.features", { returnObjects: true }) as string[];

  const handleUpgrade = async () => {
    // Mock mode returns an internal success URL; real Whop checkout in phase 7.
    const { url } = await checkout.mutateAsync(WHOP_PLAN_ID);
    closeDialog();
    if (url.startsWith("/")) {
      router.push(url);
    } else {
      window.location.href = url;
    }
  };

  return (
    <Dialog open={activeDialog === "upgrade"} onOpenChange={(o) => (!o ? closeDialog() : undefined)}>
      <DialogContent className="glass-strong border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-brand" aria-hidden="true" />
            {t("upgrade.title")}
          </DialogTitle>
          <DialogDescription>{t("upgrade.subtitle")}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2.5">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
              {feature}
            </li>
          ))}
        </ul>
        <Button
          className="w-full rounded-xl"
          onClick={() => void handleUpgrade()}
          disabled={checkout.isPending}
        >
          {checkout.isPending ? t("upgrade.processing") : t("upgrade.cta")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
