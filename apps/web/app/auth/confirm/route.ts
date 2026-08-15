import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { safeNextPath } from "@/lib/auth/post-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Email-link confirmation endpoint (signup confirmation, password recovery,
 * email change). Verifies the token hash, establishes a session, then sends
 * the user to a success / destination page.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(`${origin}/login?error=link_expired`);
  }

  // PKCE / newer Supabase emails may send ?code= instead of token_hash.
  if (code && !tokenHash) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=link_expired`);
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=link_expired`);
    }
  } else {
    return NextResponse.redirect(`${origin}/login?error=link_expired`);
  }

  // Recovery links land on the reset form; signup / email change land on success.
  if (type === "recovery" || rawNext === "/reset-password") {
    return NextResponse.redirect(`${origin}/reset-password`);
  }

  const next = safeNextPath(rawNext) ?? "/auth/confirmed";

  if (next === "/auth/confirmed" || next.startsWith("/auth/confirmed")) {
    return NextResponse.redirect(`${origin}/auth/confirmed`);
  }

  // Wrap other destinations with the success page so the user sees confirmation.
  const confirmed = new URL(`${origin}/auth/confirmed`);
  confirmed.searchParams.set("next", next);
  return NextResponse.redirect(confirmed.toString());
}
