import { z } from "zod";

/**
 * Public (browser-safe) environment variables.
 *
 * NEXT_PUBLIC_* values are inlined at build time, so each one must be
 * referenced literally (never via dynamic process.env[key] lookups).
 * Validation is lenient in mock mode so the app can run without Supabase.
 */

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  NEXT_PUBLIC_DATA_MODE: z.enum(["mock", "supabase"]).default("mock"),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.enum(["en", "fr"]).default("en"),
  /** Public hCaptcha sitekey (optional). Secret lives only in Supabase Auth. */
  NEXT_PUBLIC_HCAPTCHA_SITEKEY: z.string().optional(),
  /** PostHog project API key (official Next.js name). Empty = SDK never loads. */
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: z.string().optional(),
  /** Alias kept so older env files still work. */
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  /** PostHog ingest host. Must match the project cloud (US or EU). */
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
  /** Meta (Facebook) Pixel ID. Empty = pixel never loads. */
  NEXT_PUBLIC_META_PIXEL_ID: z.string().optional(),
  /** TikTok Pixel ID. Empty = pixel never loads. */
  NEXT_PUBLIC_TIKTOK_PIXEL_ID: z.string().optional(),
});

function readPublicEnv() {
  const raw = {
    NEXT_PUBLIC_APP_URL:
      process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || undefined,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
    // Backward compat: honour the Phase 1 flag when the new one is absent.
    NEXT_PUBLIC_DATA_MODE:
      process.env.NEXT_PUBLIC_DATA_MODE ??
      (process.env.NEXT_PUBLIC_USE_MOCK_DATA === "false" ? "supabase" : undefined),
    NEXT_PUBLIC_DEFAULT_LOCALE: process.env.NEXT_PUBLIC_DEFAULT_LOCALE,
    NEXT_PUBLIC_HCAPTCHA_SITEKEY:
      process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || undefined,
    NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN:
      process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || undefined,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY || undefined,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST || undefined,
    NEXT_PUBLIC_META_PIXEL_ID: process.env.NEXT_PUBLIC_META_PIXEL_ID || undefined,
    NEXT_PUBLIC_TIKTOK_PIXEL_ID:
      process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID || undefined,
  };
  const parsed = publicEnvSchema.safeParse(raw);
  if (!parsed.success) {
    // Never print values — field names only.
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`[stack32] Invalid public environment variables: ${fields}`);
  }
  const env = parsed.data;
  if (env.NEXT_PUBLIC_DATA_MODE === "supabase") {
    if (!env.NEXT_PUBLIC_SUPABASE_URL) {
      throw new Error(
        "[stack32] NEXT_PUBLIC_DATA_MODE=supabase requires NEXT_PUBLIC_SUPABASE_URL",
      );
    }
    if (
      !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
      !env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      throw new Error(
        "[stack32] NEXT_PUBLIC_DATA_MODE=supabase requires NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY",
      );
    }
  }
  return env;
}

export const publicEnv = readPublicEnv();

export const DATA_MODE = publicEnv.NEXT_PUBLIC_DATA_MODE;

/** Supabase browser/server key: prefer the new publishable key format. */
export const SUPABASE_KEY =
  publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export const SUPABASE_URL = publicEnv.NEXT_PUBLIC_SUPABASE_URL ?? "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
