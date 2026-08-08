"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser, useUpdatePassword } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { authErrorKey } from "@/lib/auth/errors";
import {
  getPasswordIssues,
  isPasswordValid,
  passwordIssueErrorKey,
} from "@/lib/auth/password";

export default function ChangePasswordPage() {
  const { t } = useTranslation(["auth", "errors"]);
  const router = useRouter();
  const { data: user, isLoading } = useCurrentUser();
  const update = useUpdatePassword();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!isLoading && !user) {
    router.replace("/login?next=/settings/password");
    return null;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{t("auth:changePassword.title")}</h1>
      <p className="mt-1.5 mb-2 text-sm text-muted-foreground">
        {t("auth:changePassword.subtitle")}
      </p>
      <p className="mb-6 text-xs text-muted-foreground/80">{t("auth:password.requirements")}</p>

      {done ? (
        <>
          <p
            role="status"
            className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300"
          >
            {t("auth:changePassword.success")}
          </p>
          <Button asChild className="mt-6 w-full rounded-xl">
            <Link href="/agents">{t("auth:changePassword.backToApp")}</Link>
          </Button>
        </>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (!isPasswordValid(password)) {
              const issue = getPasswordIssues(password)[0];
              setError(t(passwordIssueErrorKey(issue)));
              return;
            }
            if (password !== confirm) {
              setError(t("auth:reset.mismatch"));
              return;
            }
            try {
              await update.mutateAsync(password);
              setDone(true);
            } catch (err) {
              setError(t(authErrorKey(err)));
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="change-password">{t("auth:changePassword.password")}</Label>
            <Input
              id="change-password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth:password.placeholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="change-confirm">{t("auth:changePassword.confirm")}</Label>
            <Input
              id="change-confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t("auth:reset.confirmPlaceholder")}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full rounded-xl" disabled={update.isPending}>
            {update.isPending
              ? t("auth:changePassword.submitting")
              : t("auth:changePassword.submit")}
          </Button>
        </form>
      )}
    </div>
  );
}
