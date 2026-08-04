import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * OAuth / magic-link callback.
 *
 * With Supabase configured, exchanges the auth code for a session.
 * In mock mode (no Supabase env), simply redirects to the app — mock auth
 * happens entirely client-side.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/agents";

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.redirect(`${origin}/login?error=oauth`);
      }
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
