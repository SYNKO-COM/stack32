import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests against the LOCAL Supabase stack (supabase start) — never against
 * production. The web server is launched with the standard local dev keys
 * printed by the Supabase CLI (shared local defaults, not secrets).
 */

const LOCAL_SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const LOCAL_PUBLISHABLE_KEY =
  process.env.E2E_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const LOCAL_SECRET_KEY =
  process.env.E2E_SUPABASE_SECRET_KEY ?? "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "next dev --webpack -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_APP_URL: "http://localhost:3100",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
      NEXT_PUBLIC_DATA_MODE: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: LOCAL_PUBLISHABLE_KEY,
      SUPABASE_SERVICE_ROLE_KEY: LOCAL_SECRET_KEY,
      AI_EXECUTION_MODE: "mock",
      BILLING_MODE: "mock",
    },
  },
});
