"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSignIn, useSignInWithGoogle, useSignUp } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { authErrorKey } from "@/lib/auth/errors";
import { getAuthRepository } from "@/lib/repositories/factory";
import { USE_MOCK_DATA } from "@/lib/site";
import { cn } from "@/lib/utils";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
      />
    </svg>
  );
}

interface AuthFormProps {
  mode: "login" | "signup";
  onModeChange?: (mode: "login" | "signup") => void;
  onSuccess?: () => void;
  className?: string;
}

/** Where a successful auth should lead when no onSuccess override is given. */
async function defaultDestination(): Promise<string> {
  // Honour a middleware-provided "next" target (protected-route redirect).
  if (typeof window !== "undefined") {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next?.startsWith("/") && !next.startsWith("//")) return next;
  }
  const profile = await getAuthRepository().getProfile();
  return profile?.onboardingCompleted ? "/agents" : "/onboarding";
}

export function AuthForm({ mode, onModeChange, onSuccess, className }: AuthFormProps) {
  const { t } = useTranslation(["auth", "errors"]);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmEmailSentTo, setConfirmEmailSentTo] = useState<string | null>(null);

  const signIn = useSignIn();
  const signUp = useSignUp();
  const google = useSignInWithGoogle();

  const busy = signIn.isPending || signUp.isPending || google.isPending;
  const ns = mode === "login" ? "login" : "signup";

  const finish = async () => {
    if (onSuccess) {
      onSuccess();
    } else {
      router.push(await defaultDestination());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.includes("@")) {
      setError(t("errors:form.emailInvalid"));
      return;
    }
    if (password.length < 8) {
      setError(t("errors:form.passwordTooShort"));
      return;
    }
    try {
      if (mode === "login") {
        await signIn.mutateAsync({ email, password });
      } else {
        const result = await signUp.mutateAsync({ email, password });
        if (result.requiresEmailConfirmation) {
          setConfirmEmailSentTo(email);
          return;
        }
      }
      await finish();
    } catch (err) {
      setError(t(authErrorKey(err)));
    }
  };

  const handleGoogle = async () => {
    setError(null);
    try {
      const user = await google.mutateAsync();
      // null = OAuth redirect in progress; the provider page takes over.
      if (user) await finish();
    } catch (err) {
      setError(t(authErrorKey(err)));
    }
  };

  if (confirmEmailSentTo) {
    return (
      <div className={cn("space-y-3", className)} role="status">
        <h2 className="text-lg font-semibold">{t("auth:confirmEmail.title")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("auth:confirmEmail.subtitle", { email: confirmEmailSentTo })}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2 rounded-xl"
        onClick={handleGoogle}
        disabled={busy}
      >
        <GoogleIcon />
        {t("auth:oauth.google")}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2 rounded-xl opacity-60"
        disabled
        title={t("auth:oauth.appleSoon")}
      >
        {t("auth:oauth.apple")}
      </Button>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground uppercase">{t("auth:oauth.divider")}</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="auth-email">{t(`auth:${ns}.email`)}</Label>
          <Input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t(`auth:${ns}.emailPlaceholder`)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="auth-password">{t(`auth:${ns}.password`)}</Label>
          <Input
            id="auth-password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t(`auth:${ns}.passwordPlaceholder`)}
            required
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full rounded-xl" disabled={busy}>
          {busy ? t(`auth:${ns}.submitting`) : t(`auth:${ns}.submit`)}
        </Button>
      </form>

      {USE_MOCK_DATA ? (
        <p className="text-xs text-muted-foreground/70">{t("auth:mockNotice")}</p>
      ) : null}

      <div className="flex items-center justify-between text-sm">
        {mode === "login" ? (
          <>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => router.push("/forgot-password")}
            >
              {t("auth:login.forgotLink")}
            </button>
            <button
              type="button"
              className="text-brand hover:underline"
              onClick={() => onModeChange?.("signup")}
            >
              {t("auth:login.signupLink")}
            </button>
          </>
        ) : (
          <>
            <span className="text-muted-foreground">{t("auth:signup.hasAccount")}</span>
            <button
              type="button"
              className="text-brand hover:underline"
              onClick={() => onModeChange?.("login")}
            >
              {t("auth:signup.loginLink")}
            </button>
          </>
        )}
      </div>

      {mode === "signup" ? (
        <p className="text-xs text-muted-foreground/70">{t("auth:signup.terms")}</p>
      ) : null}
    </div>
  );
}
