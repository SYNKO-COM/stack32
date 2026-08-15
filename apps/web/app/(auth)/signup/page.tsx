"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AuthForm } from "@/components/auth/auth-form";
import { useTranslation } from "@/hooks/use-translation";

function SignupContent() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{t("signup.title")}</h1>
      <p className="mt-1.5 mb-6 text-sm text-muted-foreground">{t("signup.subtitle")}</p>
      <AuthForm
        mode="signup"
        onModeChange={(mode) => {
          const next = searchParams.get("next");
          const qs = next ? `?next=${encodeURIComponent(next)}` : "";
          router.push(mode === "signup" ? `/signup${qs}` : `/login${qs}`);
        }}
      />
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupContent />
    </Suspense>
  );
}
