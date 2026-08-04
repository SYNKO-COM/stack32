import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isSupabaseConfigured, SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

import type { Database } from "./database.types";

export type TypedSupabaseClient = SupabaseClient<Database>;

let browserClient: TypedSupabaseClient | null = null;

/**
 * Browser Supabase client (singleton).
 * Returns null when Supabase is not configured (mock mode) so the app can
 * run without credentials.
 */
export function createSupabaseBrowserClient(): TypedSupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  browserClient ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_KEY);
  return browserClient;
}

/** Browser client that throws when Supabase is not configured. */
export function requireSupabaseBrowserClient(): TypedSupabaseClient {
  const client = createSupabaseBrowserClient();
  if (!client) {
    throw new Error("[stack32] Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL missing)");
  }
  return client;
}
