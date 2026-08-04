import { describe, expect, it } from "vitest";

import { authErrorKey, AuthUiError } from "@/lib/auth/errors";

describe("authErrorKey", () => {
  it("maps Supabase error codes to translated keys", () => {
    expect(authErrorKey({ code: "invalid_credentials", message: "x" })).toBe(
      "auth:errors.invalidCredentials",
    );
    expect(authErrorKey({ code: "email_not_confirmed", message: "x" })).toBe(
      "auth:errors.emailNotConfirmed",
    );
    expect(authErrorKey({ code: "user_already_exists", message: "x" })).toBe(
      "auth:errors.emailInUse",
    );
    expect(authErrorKey({ code: "weak_password", message: "x" })).toBe(
      "auth:errors.weakPassword",
    );
    expect(authErrorKey({ code: "over_email_send_rate_limit", message: "x" })).toBe(
      "auth:errors.rateLimited",
    );
  });

  it("falls back to message heuristics for legacy errors", () => {
    expect(authErrorKey(new Error("Invalid login credentials"))).toBe(
      "auth:errors.invalidCredentials",
    );
    expect(authErrorKey(new Error("User already registered"))).toBe("auth:errors.emailInUse");
  });

  it("never leaks raw provider messages", () => {
    expect(authErrorKey(new Error("pq: duplicate key value violates unique constraint"))).toBe(
      "errors:generic",
    );
    expect(authErrorKey(undefined)).toBe("errors:generic");
    expect(authErrorKey("boom")).toBe("errors:generic");
  });

  it("honours explicit AuthUiError keys", () => {
    expect(authErrorKey(new AuthUiError("auth:errors.linkExpired"))).toBe(
      "auth:errors.linkExpired",
    );
  });
});
