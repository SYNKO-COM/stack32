import { describe, expect, it } from "vitest";

import { mapSupabaseUser } from "@/lib/domain/mappers";

/**
 * Only accounts that signed up with an email address own a Stack32 password.
 * Google/GitHub accounts have none, so the change-password option must not be
 * offered to them — the whole gate rests on this flag.
 */
describe("hasPasswordLogin", () => {
  it("is true for an email signup", () => {
    const user = mapSupabaseUser({
      id: "u1",
      email: "ada@example.com",
      app_metadata: { provider: "email", providers: ["email"] },
      identities: [{ provider: "email" }],
    });
    expect(user.hasPasswordLogin).toBe(true);
  });

  it("is false for a Google-only account", () => {
    const user = mapSupabaseUser({
      id: "u2",
      email: "ada@gmail.com",
      app_metadata: { provider: "google", providers: ["google"] },
      identities: [{ provider: "google" }],
    });
    expect(user.hasPasswordLogin).toBe(false);
  });

  it("is false for a GitHub-only account", () => {
    const user = mapSupabaseUser({
      id: "u3",
      email: "ada@users.noreply.github.com",
      app_metadata: { provider: "github", providers: ["github"] },
      identities: [{ provider: "github" }],
    });
    expect(user.hasPasswordLogin).toBe(false);
  });

  it("is true once an email identity is linked alongside Google", () => {
    const user = mapSupabaseUser({
      id: "u4",
      email: "ada@gmail.com",
      app_metadata: { provider: "google", providers: ["google", "email"] },
      identities: [{ provider: "google" }, { provider: "email" }],
    });
    expect(user.hasPasswordLogin).toBe(true);
  });

  it("stays false when the provider lists are missing entirely", () => {
    const user = mapSupabaseUser({ id: "u5", email: "ada@example.com" });
    expect(user.hasPasswordLogin).toBe(false);
  });
});
