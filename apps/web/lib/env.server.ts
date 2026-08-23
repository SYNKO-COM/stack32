import "server-only";

import { z } from "zod";

/**
 * Server-only environment variables. Importing this module from client code
 * fails at build time thanks to the "server-only" guard.
 *
 * Values are validated lazily (first access) so that mock-mode local dev and
 * CI builds without secrets keep working; production with DATA_MODE=supabase
 * fails fast with a clear, value-free error.
 */

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  AGENT_SERVICE_URL: z.string().url().default("http://localhost:8000"),
  AGENT_SERVICE_INTERNAL_TOKEN: z.string().optional(),
  AI_EXECUTION_MODE: z.enum(["mock", "disabled", "agent-service"]).default("disabled"),
  BILLING_MODE: z.enum(["mock", "whop"]).default("mock"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
    AGENT_SERVICE_URL: process.env.AGENT_SERVICE_URL || undefined,
    AGENT_SERVICE_INTERNAL_TOKEN:
      process.env.AGENT_SERVICE_INTERNAL_TOKEN || undefined,
    AI_EXECUTION_MODE: process.env.AI_EXECUTION_MODE || undefined,
    BILLING_MODE: process.env.BILLING_MODE || undefined,
  });
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`[stack32] Invalid server environment variables: ${fields}`);
  }

  // Production runtime must never silently fall back to mock billing / mock AI.
  // Use VERCEL_ENV / ENVIRONMENT — not NODE_ENV — so `next build` in CI still works.
  //
  // A preproduction deployment is its own Vercel project, so VERCEL_ENV is
  // "production" there too and this guard fired on every server action touching
  // billing — the whole Build page answered 503 with no message in the UI. The
  // guard was right, it just had no way to tell the two apart. STACK32_ENV is an
  // explicit, auditable opt-out that production never sets.
  const isPreproduction = process.env.STACK32_ENV === "preproduction";
  const isProductionRuntime =
    !isPreproduction &&
    (process.env.VERCEL_ENV === "production" || process.env.ENVIRONMENT === "production");
  if (isProductionRuntime) {
    if (parsed.data.BILLING_MODE !== "whop") {
      throw new Error(
        "[stack32] BILLING_MODE must be \"whop\" in production (mock billing is forbidden).",
      );
    }
    if (parsed.data.AI_EXECUTION_MODE === "mock") {
      throw new Error(
        "[stack32] AI_EXECUTION_MODE=mock is forbidden in production.",
      );
    }
  }

  // Mock billing outside a developer machine is always worth a line in the logs.
  if (isPreproduction && parsed.data.BILLING_MODE === "mock") {
    console.warn("[stack32] preproduction: mock billing is active; no real charges occur");
  }

  cached = parsed.data;
  return cached;
}

export function getAiExecutionMode(): "mock" | "disabled" | "agent-service" {
  return getServerEnv().AI_EXECUTION_MODE;
}

export function getBillingMode(): "mock" | "whop" {
  return getServerEnv().BILLING_MODE;
}
