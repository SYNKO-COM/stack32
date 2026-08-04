import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { isSupabaseConfigured, SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

import type { Database } from "./database.types";

export type TypedSupabaseServerClient = SupabaseClient<Database>;

/**
 * Server Supabase client (Server Components, Route Handlers, Server Actions).
 * Returns null when Supabase is not configured (mock mode).
 */
export async function createSupabaseServerClient(): Promise<TypedSupabaseServerClient | null> {
  if (!isSupabaseConfigured) return null;

  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: session refresh is handled by middleware.
        }
      },
    },
  });
}

/** Server client that throws when Supabase is not configured. */
export async function requireSupabaseServerClient(): Promise<TypedSupabaseServerClient> {
  const client = await createSupabaseServerClient();
  if (!client) {
    throw new Error("[stack32] Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL missing)");
  }
  return client;
}
