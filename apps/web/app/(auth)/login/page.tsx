"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AuthForm } from "@/components/auth/auth-form";
import { useTranslation } from "@/hooks/use-translation";

function LoginContent() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{t("login.title")}</h1>
      <p className="mt-1.5 mb-6 text-sm text-muted-foreground">{t("login.subtitle")}</p>
      {error === "link_expired" ? (
        <p role="alert" className="mb-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t("errors.linkExpired")}
        </p>
      ) : null}
      {error === "oauth" ? (
        <p role="alert" className="mb-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t("errors.oauthFailed")}
        </p>
      ) : null}
      <AuthForm
        mode="login"
        onModeChange={(mode) => {
          const next = searchParams.get("next");
          const qs = next ? `?next=${encodeURIComponent(next)}` : "";
          router.push(mode === "signup" ? `/signup${qs}` : `/login${qs}`);
        }}
      />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
