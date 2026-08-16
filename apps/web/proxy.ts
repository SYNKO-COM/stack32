import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { updateSupabaseSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 proxy (replaces deprecated middleware.ts convention).
 * Preserves auth session refresh + Google OAuth rewrite semantics.
 */
export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  // Stack32 Google OAuth client allows http://localhost:3000/ — rewrite to API callback.
  if (
    pathname === "/" &&
    searchParams.has("code") &&
    searchParams.has("state") &&
    !searchParams.has("next")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/api/connections/google/callback";
    return NextResponse.rewrite(url);
  }
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and image optimization files.
     */
    "/((?!_next/static|_next/image|favicon|brand/|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
