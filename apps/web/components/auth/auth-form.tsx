"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Trans } from "react-i18next";

import { HCaptchaGate, type HCaptchaGateHandle } from "@/components/auth/hcaptcha-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useSignIn,
  useSignInWithGithub,
  useSignInWithGoogle,
  useSignUp,
} from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { authErrorKey } from "@/lib/auth/errors";
import {
  getPasswordIssues,
  isPasswordValid,
  passwordIssueErrorKey,
} from "@/lib/auth/password";
import { resolvePostAuthPath, safeNextPath } from "@/lib/auth/post-auth";
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

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.586 2 12.253c0 4.53 2.865 8.367 6.839 9.722.5.094.683-.222.683-.492 0-.243-.01-1.052-.014-1.91-2.782.618-3.369-1.168-3.369-1.168-.454-1.18-1.11-1.494-1.11-1.494-.908-.636.069-.623.069-.623 1.003.072 1.531 1.057 1.531 1.057.892 1.564 2.341 1.112 2.91.85.091-.662.35-1.112.636-1.367-2.22-.259-4.555-1.14-4.555-5.077 0-1.122.39-2.04 1.029-2.76-.103-.259-.446-1.302.098-2.714 0 0 .84-.275 2.75 1.052A9.36 9.36 0 0 1 12 6.844a9.36 9.36 0 0 1 2.504.346c1.909-1.327 2.748-1.052 2.748-1.052.546 1.412.203 2.455.1 2.714.64.72 1.028 1.638 1.028 2.76 0 3.947-2.339 4.815-4.566 5.069.359.317.679.943.679 1.902 0 1.373-.012 2.48-.012 2.817 0 .272.18.59.688.49A10.27 10.27 0 0 0 22 12.253C22 6.586 17.523 2 12 2Z" />
    </svg>
  );
}

interface AuthFormProps {
  mode: "login" | "signup";
  onModeChange?: (mode: "login" | "signup") => void;
  onSuccess?: () => void;
  /** Preferred post-auth path (checkout, etc.). Also stored for OAuth redirects. */
  preferredNext?: string | null;
  className?: string;
}

/** Where a successful auth should lead when no onSuccess override is given. */
async function defaultDestination(preferredNext?: string | null): Promise<string> {
  const fromUrl =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("next")
      : null;
  return resolvePostAuthPath(preferredNext ?? fromUrl);
}

function rememberAuthNext(preferredNext?: string | null) {
  const safe = safeNextPath(preferredNext);
  if (!safe || typeof window === "undefined") return;
  try {
    sessionStorage.setItem("stack32_auth_next", safe);
  } catch {
    /* ignore */
  }
}

export function AuthForm({
  mode,
  onModeChange,
  onSuccess,
  preferredNext,
  className,
}: AuthFormProps) {
  const { t } = useTranslation(["auth", "errors"]);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const signIn = useSignIn();
  const signUp = useSignUp();
  const google = useSignInWithGoogle();
  const github = useSignInWithGithub();
  const captchaRef = useRef<HCaptchaGateHandle>(null);

  const busy =
    signIn.isPending || signUp.isPending || google.isPending || github.isPending;
  const ns = mode === "login" ? "login" : "signup";

  useEffect(() => {
    rememberAuthNext(preferredNext);
  }, [preferredNext]);

  const finish = async () => {
    if (onSuccess) {
      onSuccess();
    } else {
      router.push(await defaultDestination(preferredNext));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.includes("@")) {
      setError(t("errors:form.emailInvalid"));
      return;
    }
    if (mode === "signup") {
      if (!isPasswordValid(password)) {
        const issue = getPasswordIssues(password)[0];
        setError(t(passwordIssueErrorKey(issue)));
        return;
      }
    } else if (password.length < 1) {
      setError(t("errors:form.required"));
      return;
    }
    try {
      const captchaToken = await captchaRef.current?.getToken();
      if (mode === "login") {
        await signIn.mutateAsync({ email, password, captchaToken });
        captchaRef.current?.reset();
        await finish();
        return;
      }

      const result = await signUp.mutateAsync({ email, password, captchaToken });
      captchaRef.current?.reset();
      if (result.requiresEmailConfirmation) {
        const next =
          safeNextPath(preferredNext) ??
          (typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("next")
            : null);
        const nextQs = next ? `&next=${encodeURIComponent(next)}` : "";
        router.push(`/verify-email?email=${encodeURIComponent(email)}${nextQs}`);
        return;
      }
      await finish();
    } catch (err) {
      captchaRef.current?.reset();
      setError(t(authErrorKey(err)));
    }
  };

  const handleOAuth = async (provider: "google" | "github") => {
    setError(null);
    rememberAuthNext(
      preferredNext ??
        (typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("next")
          : null),
    );
    try {
      const mutation = provider === "google" ? google : github;
      const user = await mutation.mutateAsync();
      if (user) await finish();
    } catch (err) {
      setError(t(authErrorKey(err)));
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2 rounded-xl"
        onClick={() => handleOAuth("google")}
        disabled={busy}
      >
        <GoogleIcon />
        {t("auth:oauth.google")}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2 rounded-xl"
        onClick={() => handleOAuth("github")}
        disabled={busy}
      >
        <GithubIcon />
        {t("auth:oauth.github")}
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
            placeholder={
              mode === "signup" ? t("auth:password.placeholder") : t(`auth:${ns}.passwordPlaceholder`)
            }
            required
          />
          {mode === "signup" ? (
            <p className="text-xs text-muted-foreground/80">{t("auth:password.requirements")}</p>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <HCaptchaGate ref={captchaRef} />

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
        <p className="text-xs leading-relaxed text-muted-foreground/70 [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2">
          <Trans
            i18nKey="auth:signup.terms"
            components={{
              terms: <Link href="/legal/terms" target="_blank" rel="noreferrer" />,
              privacy: <Link href="/legal/privacy" target="_blank" rel="noreferrer" />,
            }}
          />
        </p>
      ) : null}
    </div>
  );
}
