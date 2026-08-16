"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthWindow } from "@/components/auth/auth-window";
import { useTranslation } from "@/hooks/use-translation";

function LoginContent() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const next = searchParams.get("next");

  return (
    <AuthWindow
      mode="login"
      title={t("login.title")}
      subtitle={t("login.subtitle")}
    >
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
        preferredNext={next}
        onModeChange={(mode) => {
          const qs = next ? `?next=${encodeURIComponent(next)}` : "";
          router.push(mode === "signup" ? `/signup${qs}` : `/login${qs}`);
        }}
      />
    </AuthWindow>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
