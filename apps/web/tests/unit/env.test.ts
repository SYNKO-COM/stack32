import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BASE_ENV = { ...process.env };

function resetEnv(vars: Record<string, string | undefined>) {
  process.env = { ...BASE_ENV };
  delete process.env.NEXT_PUBLIC_DATA_MODE;
  delete process.env.NEXT_PUBLIC_USE_MOCK_DATA;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) process.env[key] = value;
  }
}

describe("public env validation", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    process.env = { ...BASE_ENV };
  });

  it("defaults to mock mode without configuration", async () => {
    resetEnv({});
    const env = await import("@/lib/env");
    expect(env.DATA_MODE).toBe("mock");
    expect(env.isSupabaseConfigured).toBe(false);
  });

  it("honours the legacy NEXT_PUBLIC_USE_MOCK_DATA flag", async () => {
    resetEnv({
      NEXT_PUBLIC_USE_MOCK_DATA: "false",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });
    const env = await import("@/lib/env");
    expect(env.DATA_MODE).toBe("supabase");
  });

  it("prefers the publishable key over the legacy anon key", async () => {
    resetEnv({
      NEXT_PUBLIC_DATA_MODE: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });
    const env = await import("@/lib/env");
    expect(env.SUPABASE_KEY).toBe("sb_publishable_x");
    expect(env.isSupabaseConfigured).toBe(true);
  });

  it("fails fast when supabase mode lacks credentials", async () => {
    resetEnv({ NEXT_PUBLIC_DATA_MODE: "supabase" });
    await expect(import("@/lib/env")).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("prefers the official PostHog project token over the alias", async () => {
    resetEnv({
      NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc_official",
      NEXT_PUBLIC_POSTHOG_KEY: "phc_alias",
      NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
    });
    const tracking = await import("@/lib/tracking");
    expect(tracking.POSTHOG_KEY).toBe("phc_official");
    expect(tracking.POSTHOG_HOST).toBe("https://us.i.posthog.com");
    expect(tracking.isPostHogConfigured).toBe(true);
  });
});
