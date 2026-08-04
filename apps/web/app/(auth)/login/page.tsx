"use client";

import { useRouter } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { useTranslation } from "@/hooks/use-translation";

export default function LoginPage() {
  const { t } = useTranslation("auth");
  const router = useRouter();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{t("login.title")}</h1>
      <p className="mt-1.5 mb-6 text-sm text-muted-foreground">{t("login.subtitle")}</p>
      <AuthForm
        mode="login"
        onModeChange={(mode) => router.push(mode === "signup" ? "/signup" : "/login")}
      />
    </div>
  );
}
