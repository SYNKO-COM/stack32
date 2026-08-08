/**
 * Maps raw Supabase Auth errors to safe, translated UI error keys.
 * Never surface internal provider messages directly to users.
 */

const CODE_TO_KEY: Record<string, string> = {
  invalid_credentials: "auth:errors.invalidCredentials",
  email_not_confirmed: "auth:errors.emailNotConfirmed",
  user_already_exists: "auth:errors.emailInUse",
  email_exists: "auth:errors.emailInUse",
  weak_password: "auth:errors.weakPassword",
  over_email_send_rate_limit: "auth:errors.rateLimited",
  over_request_rate_limit: "auth:errors.rateLimited",
  signup_disabled: "auth:errors.signupDisabled",
  session_expired: "auth:errors.sessionExpired",
  refresh_token_not_found: "auth:errors.sessionExpired",
  otp_expired: "auth:errors.linkExpired",
  otp_disabled: "auth:errors.invalidOtp",
  user_not_found: "auth:errors.invalidCredentials",
  same_password: "auth:errors.samePassword",
};

export class AuthUiError extends Error {
  readonly i18nKey: string;

  constructor(i18nKey: string, message?: string) {
    super(message ?? i18nKey);
    this.name = "AuthUiError";
    this.i18nKey = i18nKey;
  }
}

/** Translate any thrown auth error into an i18n key ("ns:path" format). */
export function authErrorKey(error: unknown): string {
  if (error instanceof AuthUiError) return error.i18nKey;
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && CODE_TO_KEY[code]) return CODE_TO_KEY[code];
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      const lower = message.toLowerCase();
      if (lower.includes("invalid login credentials")) return "auth:errors.invalidCredentials";
      if (lower.includes("email not confirmed")) return "auth:errors.emailNotConfirmed";
      if (lower.includes("already registered")) return "auth:errors.emailInUse";
      if (lower.includes("token") && lower.includes("expired")) return "auth:errors.linkExpired";
      if (lower.includes("otp") || lower.includes("token is invalid")) return "auth:errors.invalidOtp";
      if (lower.includes("rate limit")) return "auth:errors.rateLimited";
      if (lower.includes("network") || lower.includes("fetch")) return "errors:network";
    }
  }
  return "errors:generic";
}
