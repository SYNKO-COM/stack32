import { NextResponse, type NextRequest } from "next/server";

import {
  agentServiceFetch,
  requireAccessToken,
} from "@/lib/ai/agent-service-client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Google ConnectionManager OAuth callback.
 * Redirect URI registered on the Stack32 GCP client is http://localhost:3000/
 * (middleware rewrites /?code&state → here).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${origin}/agents?connection_error=${encodeURIComponent(error)}`,
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(`${origin}/agents?connection_error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?next=/api/connections/google/callback`);
  }

  try {
    const accessToken = await requireAccessToken();
    const result = await agentServiceFetch<{
      connection_id?: string;
      account_email?: string;
      agent_id?: string | null;
    }>("/v1/connections/google/callback", {
      method: "POST",
      accessToken,
      body: { code, state },
    });

    const agentId =
      typeof result.agent_id === "string" && result.agent_id.length > 0
        ? result.agent_id
        : null;

    // Continue the paused builder run now that Google is bound to this agent.
    if (agentId) {
      try {
        await agentServiceFetch(`/v1/agents/${agentId}/builder/resume-connection`, {
          method: "POST",
          accessToken,
          body: {},
        });
      } catch {
        // Resume is best-effort; user can reconnect from the builder card.
      }
      const email = result.account_email
        ? `?connected=${encodeURIComponent(result.account_email)}`
        : "?connected=google";
      return NextResponse.redirect(`${origin}/agents/${agentId}${email}`);
    }

    const email = result.account_email
      ? `?connected=${encodeURIComponent(result.account_email)}`
      : "?connected=google";
    return NextResponse.redirect(`${origin}/agents${email}`);
  } catch {
    return NextResponse.redirect(`${origin}/agents?connection_error=callback_failed`);
  }
}
