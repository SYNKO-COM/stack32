/**
 * Password policy aligned with Supabase Auth settings:
 * - minimum 10 characters
 * - lowercase, uppercase, digits and symbols required
 */
export const PASSWORD_MIN_LENGTH = 10;

/** OTP / email link validity shown to users (matches Supabase: 3600 seconds). */
export const AUTH_OTP_EXPIRY_SECONDS = 3600;
export const AUTH_OTP_EXPIRY_MINUTES = AUTH_OTP_EXPIRY_SECONDS / 60;
export const AUTH_OTP_LENGTH = 6;

export type PasswordIssue =
  | "tooShort"
  | "missingLower"
  | "missingUpper"
  | "missingDigit"
  | "missingSymbol";

const HAS_LOWER = /[a-z]/;
const HAS_UPPER = /[A-Z]/;
const HAS_DIGIT = /\d/;
const HAS_SYMBOL = /[^A-Za-z0-9]/;

export function getPasswordIssues(password: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) issues.push("tooShort");
  if (!HAS_LOWER.test(password)) issues.push("missingLower");
  if (!HAS_UPPER.test(password)) issues.push("missingUpper");
  if (!HAS_DIGIT.test(password)) issues.push("missingDigit");
  if (!HAS_SYMBOL.test(password)) issues.push("missingSymbol");
  return issues;
}

export function isPasswordValid(password: string): boolean {
  return getPasswordIssues(password).length === 0;
}

/** i18n key under errors:form.* for the first password issue. */
export function passwordIssueErrorKey(issue: PasswordIssue): string {
  switch (issue) {
    case "tooShort":
      return "errors:form.passwordTooShort";
    case "missingLower":
      return "errors:form.passwordMissingLower";
    case "missingUpper":
      return "errors:form.passwordMissingUpper";
    case "missingDigit":
      return "errors:form.passwordMissingDigit";
    case "missingSymbol":
      return "errors:form.passwordMissingSymbol";
  }
}
