"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSendPasswordReset } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";

export default function ForgotPasswordPage() {
  const { t } = useTranslation("auth");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const reset = useSendPasswordReset();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{t("forgot.title")}</h1>
      <p className="mt-1.5 mb-6 text-sm text-muted-foreground">{t("forgot.subtitle")}</p>

      {sent ? (
        <p role="status" className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {t("forgot.success")}
        </p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            await reset.mutateAsync(email);
            setSent(true);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="forgot-email">{t("forgot.email")}</Label>
            <Input
              id="forgot-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("forgot.emailPlaceholder")}
            />
          </div>
          <Button type="submit" className="w-full rounded-xl" disabled={reset.isPending}>
            {reset.isPending ? t("forgot.submitting") : t("forgot.submit")}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-brand hover:underline">
          {t("forgot.backToLogin")}
        </Link>
      </p>
    </div>
  );
}
