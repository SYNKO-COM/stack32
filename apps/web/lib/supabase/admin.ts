import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin Supabase client using the service-role key.
 *
 * SERVER-ONLY: importing this module from client code fails at build time
 * thanks to the "server-only" package guard. The service-role key must
 * NEVER be exposed to the browser.
 */
export function createSupabaseAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
