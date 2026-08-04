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
