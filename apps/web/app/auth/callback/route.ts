import { NextResponse, type NextRequest } from "next/server";

import { onboardingPathForNext, safeNextPath } from "@/lib/auth/post-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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
  const next = safeNextPath(searchParams.get("next")) ?? "/agents";

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.redirect(`${origin}/login?error=oauth`);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Profile row can lag briefly after first OAuth; retry before treating
        // a missing row as "needs onboarding".
        let completed = false;
        let found = false;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("onboarding_completed")
            .eq("id", user.id)
            .maybeSingle();
          if (profile) {
            found = true;
            completed = Boolean(profile.onboarding_completed);
            break;
          }
          await wait(200);
        }

        if (found && completed) {
          const dest = next === "/onboarding" || next.startsWith("/onboarding?") ? "/agents" : next;
          return NextResponse.redirect(`${origin}${dest}`);
        }
        if (found && !completed) {
          return NextResponse.redirect(`${origin}${onboardingPathForNext(next)}`);
        }
        // Still no profile after retries — safest for brand-new OAuth users.
        return NextResponse.redirect(`${origin}${onboardingPathForNext(next)}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
