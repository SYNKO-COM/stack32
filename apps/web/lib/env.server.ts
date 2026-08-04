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
  AI_EXECUTION_MODE: z.enum(["mock", "disabled"]).default("disabled"),
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
  cached = parsed.data;
  return cached;
}

export function getAiExecutionMode(): "mock" | "disabled" {
  return getServerEnv().AI_EXECUTION_MODE;
}

export function getBillingMode(): "mock" | "whop" {
  return getServerEnv().BILLING_MODE;
}
