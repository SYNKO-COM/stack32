"use client";

import { Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Trans } from "react-i18next";

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
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";

function ConsentCheckbox({
  id,
  checked,
  onCheckedChange,
  children,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm leading-snug">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className={cn(
          "mt-0.5 size-4 shrink-0 cursor-pointer appearance-none rounded-full border border-border bg-background",
          "checked:border-brand checked:bg-brand checked:shadow-[inset_0_0_0_3px_hsl(var(--background))]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
        )}
      />
      <span className="text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2">
        {children}
      </span>
    </label>
  );
}

export function UpgradeDialog() {
  const { t } = useTranslation("billing");
  const router = useRouter();
  const activeDialog = useUiStore((s) => s.activeDialog);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const checkout = useCreateCheckout();

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedImmediate, setAcceptedImmediate] = useState(false);

  const open = activeDialog === "upgrade";
  const features = t("upgrade.features", { returnObjects: true }) as string[];
  const canCheckout = acceptedTerms && acceptedImmediate && !checkout.isPending;

  useEffect(() => {
    if (!open) {
      setAcceptedTerms(false);
      setAcceptedImmediate(false);
    }
  }, [open]);

  const handleUpgrade = async () => {
    if (!canCheckout) return;
    // Mock mode returns an internal success URL; real Whop checkout in phase 7.
    const { url } = await checkout.mutateAsync(WHOP_PLAN_ID);
    closeDialog();
    if (url.startsWith("/")) {
      router.push(url);
    } else {
      window.location.href = url;
    }
  };

  const legalLinkClass = "font-medium hover:text-brand";

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? closeDialog() : undefined)}>
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

        <div className="space-y-3 border-t border-border/60 pt-4">
          <ConsentCheckbox
            id="checkout-accept-terms"
            checked={acceptedTerms}
            onCheckedChange={setAcceptedTerms}
          >
            <Trans
              i18nKey="billing:upgrade.consents.terms"
              components={{
                terms: (
                  <Link href="/legal/terms" target="_blank" className={legalLinkClass} />
                ),
                sales: (
                  <Link href="/legal/sales" target="_blank" className={legalLinkClass} />
                ),
                refunds: (
                  <Link href="/legal/refunds" target="_blank" className={legalLinkClass} />
                ),
              }}
            />
          </ConsentCheckbox>
          <ConsentCheckbox
            id="checkout-accept-immediate"
            checked={acceptedImmediate}
            onCheckedChange={setAcceptedImmediate}
          >
            {t("upgrade.consents.immediate")}
          </ConsentCheckbox>
        </div>

        <Button
          className="w-full rounded-xl"
          onClick={() => void handleUpgrade()}
          disabled={!canCheckout}
        >
          {checkout.isPending ? t("upgrade.processing") : t("upgrade.cta")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
