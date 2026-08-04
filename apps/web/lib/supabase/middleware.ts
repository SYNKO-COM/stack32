import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured, SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

/** Route prefixes that require an authenticated user. */
const PROTECTED_PREFIXES = ["/onboarding", "/agents", "/settings", "/billing"];

/** Auth screens an already-authenticated user should not see again. */
const AUTH_SCREENS = ["/login", "/signup"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Session refresh + server-side route protection.
 *
 * Onboarding completeness is enforced by server layouts (lib/auth/guards.ts):
 * the middleware only guarantees an authenticated session for protected routes
 * and keeps auth cookies fresh.
 */
export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.next({ request });
  // Mock mode: no Supabase — client-side mock guards handle the demo flow.
  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // IMPORTANT: getUser() validates the session with the auth server and
  // refreshes cookies. Do not remove or reorder.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && isProtectedPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Preserve the intended destination across login.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && AUTH_SCREENS.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/agents";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
