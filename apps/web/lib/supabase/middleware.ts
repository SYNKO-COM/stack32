import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/post-auth";
import { isSupabaseConfigured, SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

/** Route prefixes that require an authenticated user. */
const PROTECTED_PREFIXES = [
  "/onboarding",
  "/agents",
  "/settings",
  "/billing",
  "/my-agents",
];

/** Auth screens an already-authenticated user should not see again. */
const AUTH_SCREENS = ["/login", "/signup"];

const USERNAME_RE = /^[a-z][a-z0-9_]{2,29}$/;
/** URL-safe agent slug (lowercase letters, digits, hyphens). */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function parsePrettyAgentPath(
  pathname: string,
): { username: string; slug: string } | null {
  const match = pathname.match(/^\/@([^/]+)\/([^/]+)\/?$/);
  if (!match) return null;
  const username = match[1].toLowerCase();
  const slug = match[2].toLowerCase();
  if (!USERNAME_RE.test(username) || !SLUG_RE.test(slug)) return null;
  return { username, slug };
}

function loginRedirect(request: NextRequest, nextPath: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const safe = safeNextPath(nextPath);
  if (safe) url.searchParams.set("next", safe);
  return NextResponse.redirect(url);
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
  if (!isSupabaseConfigured) {
    const pretty = parsePrettyAgentPath(request.nextUrl.pathname);
    if (pretty) {
      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = `/p/${pretty.username}/${pretty.slug}`;
      return NextResponse.rewrite(rewriteUrl);
    }
    return response;
  }

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

  const pretty = parsePrettyAgentPath(pathname);
  if (pretty) {
    // Public agent pages are crawlable; interactive Live stays gated in the page.
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/p/${pretty.username}/${pretty.slug}`;
    const rewriteResponse = NextResponse.rewrite(rewriteUrl);
    for (const cookie of response.cookies.getAll()) {
      rewriteResponse.cookies.set(cookie);
    }
    return rewriteResponse;
  }

  if (!user && isProtectedPath(pathname)) {
    return loginRedirect(request, pathname);
  }

  if (user && AUTH_SCREENS.includes(pathname)) {
    const preferred = safeNextPath(request.nextUrl.searchParams.get("next"));
    const url = request.nextUrl.clone();
    if (preferred) {
      const parsed = new URL(preferred, "https://stack32.invalid");
      url.pathname = parsed.pathname;
      url.search = parsed.search;
      url.hash = parsed.hash;
    } else {
      url.pathname = "/agents";
      url.search = "";
      url.hash = "";
    }
    return NextResponse.redirect(url);
  }

  return response;
}
