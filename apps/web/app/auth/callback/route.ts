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
  const rawNext = searchParams.get("next") ?? "/agents";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/agents";

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.redirect(`${origin}/login?error=oauth`);
      }
      // Incomplete onboarding lands on /onboarding instead of the app.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("id", user.id)
          .maybeSingle();
        // Missing profile (trigger lag) or incomplete onboarding → onboarding.
        if (!profile || !profile.onboarding_completed) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }
      }
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
