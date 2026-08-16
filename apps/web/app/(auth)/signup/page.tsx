"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthWindow } from "@/components/auth/auth-window";
import { useTranslation } from "@/hooks/use-translation";

function SignupContent() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  return (
    <AuthWindow
      mode="signup"
      title={t("signup.title")}
      subtitle={t("signup.subtitle")}
    >
      <AuthForm
        mode="signup"
        preferredNext={next}
        onModeChange={(mode) => {
          const qs = next ? `?next=${encodeURIComponent(next)}` : "";
          router.push(mode === "signup" ? `/signup${qs}` : `/login${qs}`);
        }}
      />
    </AuthWindow>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupContent />
    </Suspense>
  );
}
