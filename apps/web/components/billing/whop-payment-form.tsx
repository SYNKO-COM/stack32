"use client";

import { loadWhop } from "@whop/elements";
import { AddressElement, BrandingElement, EmailElement, PaymentElement, Payments, WhopElements, usePayments, useWhop } from "@whop/elements-react";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { useTranslation } from "@/hooks/use-translation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { payCheckout, quoteCheckout } from "@/lib/actions/checkout-payment";
import type { WhopCheckoutSessionResult } from "@/lib/actions/billing";
import { WhopElementsCheckout } from "./whop-elements-checkout";

type Props = { session: WhopCheckoutSessionResult; acceptedTerms: boolean; acceptedImmediate: boolean; returnUrl: string };
type Address = Parameters<typeof quoteCheckout>[0]["address"];
type Quote = Awaited<ReturnType<typeof quoteCheckout>>;

export function WhopPaymentForm(props: Props) {
  const { theme } = useTheme();
  const { i18n } = useTranslation("billing");
  const [elements] = useState(() => loadWhop());
  const [hosted, setHosted] = useState(false);
  if (hosted || !props.session.planId) return (
    <div inert={!props.acceptedTerms || !props.acceptedImmediate} className={!props.acceptedTerms || !props.acceptedImmediate ? "opacity-50" : undefined}>
      <WhopElementsCheckout configurationId={props.session.sessionId} returnUrl={props.returnUrl} buyerEmail={props.session.buyerEmail} />
    </div>
  );
  return (
    <WhopElements elements={elements} locale={i18n.language.startsWith("fr") ? "fr" : "en"}
      appearance={{ theme: { appearance: theme === "dark" ? "dark" : "light", accentColor: "orange" } }}
      onLoadError={() => setHosted(true)}>
      <Payments accountId={props.session.accountId} plan={props.session.planId} returnUrl={props.returnUrl} setupFutureUsage="off_session">
        <PaymentFields {...props} onHosted={() => setHosted(true)} />
      </Payments>
    </WhopElements>
  );
}

function PaymentFields({ session, acceptedTerms, acceptedImmediate, returnUrl, onHosted }: Props & { onHosted: () => void }) {
  const { t, i18n } = useTranslation("billing");
  const payments = usePayments();
  const whop = useWhop();
  const [ready, setReady] = useState(false);
  const [address, setAddress] = useState<Address | null>(null);
  const [promo, setPromo] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attemptStarted, setAttemptStarted] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const busyRef = useRef(false);
  // Retain the token on an ambiguous network failure: retry the SAME payment.
  const attempt = useRef<{ token: string; quote: Quote; payment?: Awaited<ReturnType<typeof payCheckout>> } | null>(null);
  const allowed = acceptedTerms && acceptedImmediate;

  useEffect(() => {
    if (!address || busyRef.current || attempt.current) return;
    let cancelled = false;
    setQuote(null);
    const timer = setTimeout(() => {
      setQuoting(true);
      setError(false);
      void quoteCheckout({ configurationId: session.sessionId, address, promoCode: promo }).then((value) => {
        if (!cancelled) setQuote(value);
      }).catch(() => { if (!cancelled) setError(true); }).finally(() => { if (!cancelled) setQuoting(false); });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [address, promo, session.sessionId, refresh]);

  function finish(payment: string, status: string) {
    const destination = new URL(returnUrl);
    destination.searchParams.set("payment", payment);
    destination.searchParams.set("status", status);
    window.location.assign(destination.href);
  }

  async function pay() {
    if (!payments || !whop || !allowed || !ready || busyRef.current || !quote || !address) return;
    if (Date.parse(quote.expiresAt) <= Date.now() && !attempt.current) { setRefresh((n) => n + 1); return; }
    busyRef.current = true;
    setBusy(true);
    setError(false);
    try {
      if (!attempt.current) {
        const result = await payments.createConfirmationToken({ billingDetails: { name: address.name, address } });
        attempt.current = { token: result.confirmationToken, quote };
        setAttemptStarted(true);
      }
      const payment = attempt.current.payment ?? await payCheckout({ configurationId: session.sessionId, confirmationToken: attempt.current.token, ...attempt.current.quote, acceptedTerms, acceptedImmediate });
      attempt.current.payment = payment;
      if (payment.status === "paid") { finish(payment.id, "succeeded"); return; }
      if (!payment.clientSecret) { finish(payment.id, "processing"); return; }
      const result = await whop.payments.handleNextAction({ clientSecret: payment.clientSecret });
      if (result.redirected) return;
      if (result.status === "succeeded" || result.status === "processing") { finish(payment.id, result.status); return; }
      // The payment may still require 3DS: keep its quote/token so another tap
      // resumes the existing attempt, never creates a second charge.
      if (["failed", "canceled", "requires_payment_method"].includes(result.status)) { attempt.current = null; setAttemptStarted(false); setQuote(null); setRefresh((n) => n + 1); }
      setError(true);
    } catch { setError(true); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const total = quote ? new Intl.NumberFormat(i18n.language, { style: "currency", currency: quote.currency }).format(Number(quote.total)) : null;
  return (
    <div className="space-y-4">
      <div inert={busy || attemptStarted} className="space-y-4">
        <EmailElement defaultValue={session.buyerEmail} />
        <AddressElement mode="billing" name="combined" layout="wrap" onChange={(event) => { if (busyRef.current || attempt.current) return; setQuoting(false); setQuote(null); setAddress(event.complete ? event.address : null); }} />
        <PaymentElement fields={{ billingDetails: "never" }} onChange={(event) => setReady(event.complete)} onError={() => setError(true)} />
        <label className="block text-sm">{t("checkout.promo")}<Input className="mt-2" value={promo} maxLength={100} onChange={(e) => { setQuote(null); setPromo(e.target.value); }} /></label>
      </div>
      <BrandingElement />
      <p className="text-sm font-medium" aria-live="polite">{quoting ? t("checkout.calculating") : total ? t("checkout.total", { amount: total }) : t("checkout.addressRequired")}</p>
      <Button type="button" className="min-h-12 w-full rounded-full" disabled={!allowed || !ready || !quote || !payments || !whop || busy || quoting} onClick={() => void pay()} aria-describedby="checkout-consent-hint">
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        {busy ? t("checkout.processing") : t("checkout.subscribe", { amount: total ?? "" })}
      </Button>
      <p id="checkout-consent-hint" className="text-sm text-muted-foreground">{!allowed ? t("checkout.unlockHint") : t("checkout.secureFields")}</p>
      {error ? <p role="alert" className="text-sm text-destructive">{t("checkout.paymentNotConfirmed")}</p> : null}
      {!attemptStarted && <Button type="button" variant="ghost" className="h-auto min-h-11 w-full whitespace-normal" disabled={!allowed || busy} onClick={onHosted}>{t("checkout.hostedFallback")}</Button>}
      {!attemptStarted && error && <Button type="button" variant="outline" onClick={() => setRefresh((n) => n + 1)}>{t("checkout.retryQuote")}</Button>}
    </div>
  );
}
