import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_URL } from "@/lib/env";

import type { Database } from "./database.types";

/**
 * Admin Supabase client using the service-role key.
 *
 * SERVER-ONLY: importing this module from client code fails at build time
 * thanks to the "server-only" package guard. The service-role key must
 * NEVER be exposed to the browser.
 */
export function createSupabaseAdminClient(): SupabaseClient<Database> | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !serviceRoleKey) return null;
  return createClient<Database>(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Admin client that throws when the service role key is not configured. */
export function requireSupabaseAdminClient(): SupabaseClient<Database> {
  const client = createSupabaseAdminClient();
  if (!client) {
    throw new Error("[stack32] SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return client;
}
