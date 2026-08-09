"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { OtpInput } from "@/components/auth/otp-input";
import { Button } from "@/components/ui/button";
import { useResendSignupOtp, useVerifySignupOtp } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { authErrorKey } from "@/lib/auth/errors";
import { AUTH_OTP_EXPIRY_MINUTES, AUTH_OTP_LENGTH } from "@/lib/auth/password";
import { getAuthRepository } from "@/lib/repositories/factory";
import { USE_MOCK_DATA } from "@/lib/site";

async function postVerifyDestination(): Promise<string> {
  const profile = await getAuthRepository().getProfile();
  return profile?.onboardingCompleted ? "/agents" : "/onboarding";
}

function VerifyEmailForm() {
  const { t } = useTranslation(["auth", "errors"]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email")?.trim() ?? "";

  const [email] = useState(emailParam);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const verify = useVerifySignupOtp();
  const resend = useResendSignupOtp();
  const busy = verify.isPending || resend.isPending;

  useEffect(() => {
    if (!email || !email.includes("@")) {
      router.replace("/signup");
    }
  }, [email, router]);

  const submitCode = async (token: string) => {
    if (token.length !== AUTH_OTP_LENGTH || !email) return;
    setError(null);
    setResent(false);
    try {
      await verify.mutateAsync({ email, token });
      router.push(await postVerifyDestination());
    } catch (err) {
      setError(t(authErrorKey(err)));
      setCode("");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{t("auth:verifyEmail.title")}</h1>
      <p className="mt-1.5 mb-2 text-sm text-muted-foreground">
        {t("auth:verifyEmail.subtitle", { email })}
      </p>
      <p className="mb-6 text-xs text-muted-foreground/80">
        {t("auth:verifyEmail.expiry", { minutes: AUTH_OTP_EXPIRY_MINUTES })}
      </p>

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submitCode(code);
        }}
      >
        <OtpInput
          value={code}
          onChange={(value) => {
            setCode(value);
            setError(null);
            if (value.length === AUTH_OTP_LENGTH) void submitCode(value);
          }}
          disabled={busy}
          aria-label={t("auth:verifyEmail.codeLabel")}
        />

        {error ? (
          <p role="alert" className="text-center text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {resent ? (
          <p role="status" className="text-center text-sm text-emerald-600 dark:text-emerald-400">
            {t("auth:verifyEmail.resent")}
          </p>
        ) : null}

        <Button
          type="submit"
          className="w-full rounded-xl"
          disabled={busy || code.length !== AUTH_OTP_LENGTH}
        >
          {verify.isPending ? t("auth:verifyEmail.submitting") : t("auth:verifyEmail.submit")}
        </Button>
      </form>

      <div className="mt-6 space-y-3 text-center text-sm">
        <button
          type="button"
          className="text-brand hover:underline disabled:opacity-50"
          disabled={busy || !email}
          onClick={async () => {
            setError(null);
            try {
              await resend.mutateAsync(email);
              setResent(true);
            } catch (err) {
              setError(t(authErrorKey(err)));
            }
          }}
        >
          {resend.isPending ? t("auth:verifyEmail.resending") : t("auth:verifyEmail.resend")}
        </button>
        <p>
          <Link href="/login" className="text-muted-foreground hover:text-foreground">
            {t("auth:verifyEmail.backToLogin")}
          </Link>
        </p>
      </div>

      {USE_MOCK_DATA ? (
        <p className="mt-4 text-center text-xs text-muted-foreground/70">
          {t("auth:verifyEmail.mockHint")}
        </p>
      ) : null}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}
