"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSendPasswordReset } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { authErrorKey } from "@/lib/auth/errors";
import { AUTH_OTP_EXPIRY_MINUTES } from "@/lib/auth/password";

export default function ForgotPasswordPage() {
  const { t } = useTranslation(["auth", "errors"]);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reset = useSendPasswordReset();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{t("auth:forgot.title")}</h1>
      <p className="mt-1.5 mb-2 text-sm text-muted-foreground">{t("auth:forgot.subtitle")}</p>
      <p className="mb-6 text-xs text-muted-foreground/80">
        {t("auth:forgot.expiry", { minutes: AUTH_OTP_EXPIRY_MINUTES })}
      </p>

      {sent ? (
        <p
          role="status"
          className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300"
        >
          {t("auth:forgot.success")}
        </p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              await reset.mutateAsync(email);
              setSent(true);
            } catch (err) {
              setError(t(authErrorKey(err)));
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="forgot-email">{t("auth:forgot.email")}</Label>
            <Input
              id="forgot-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth:forgot.emailPlaceholder")}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full rounded-xl" disabled={reset.isPending}>
            {reset.isPending ? t("auth:forgot.submitting") : t("auth:forgot.submit")}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-brand hover:underline">
          {t("auth:forgot.backToLogin")}
        </Link>
      </p>
    </div>
  );
}
