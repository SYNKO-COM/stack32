"use client";

import { useRouter } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { useTranslation } from "@/hooks/use-translation";

export default function SignupPage() {
  const { t } = useTranslation("auth");
  const router = useRouter();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{t("signup.title")}</h1>
      <p className="mt-1.5 mb-6 text-sm text-muted-foreground">{t("signup.subtitle")}</p>
      <AuthForm
        mode="signup"
        onModeChange={(mode) => router.push(mode === "signup" ? "/signup" : "/login")}
      />
    </div>
  );
}
