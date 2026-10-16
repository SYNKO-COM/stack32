"use client";

import { loadWhop } from "@whop/elements";
import { Checkout, CheckoutElement, WhopElements } from "@whop/elements-react";
import { useState } from "react";
import { useTheme } from "@/components/providers/theme-provider";
import { useTranslation } from "@/hooks/use-translation";

/** All payment fields and payment actions remain inside Whop's hosted checkout. */
export function WhopElementsCheckout({ configurationId, returnUrl, onComplete, buyerEmail }: {
  configurationId: string;
  returnUrl: string;
  onComplete?: () => void;
  buyerEmail?: string;
}) {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation("billing");
  const [elements] = useState(() => loadWhop());
  const [failed, setFailed] = useState(false);
  return (
    <WhopElements elements={elements} onLoadError={() => setFailed(true)}>
      <Checkout
        checkoutConfiguration={configurationId}
        returnUrl={returnUrl}
        locale={i18n.language.startsWith("fr") ? "fr" : "en"}
        appearance={{ theme: { appearance: theme === "dark" ? "dark" : "light", accentColor: "orange" } }}
        onComplete={(result) => { if (result.result === "payment") onComplete?.(); }}
      >
        <CheckoutElement buyerEmail={buyerEmail} onError={() => setFailed(true)} onReady={() => setFailed(false)} />
      </Checkout>
      {failed ? <p role="alert" className="p-4 text-sm text-destructive">{t("checkout.errorTitle")}</p> : null}
    </WhopElements>
  );
}
