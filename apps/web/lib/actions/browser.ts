"use server";

import {
  agentServiceFetch,
  requireAccessToken,
} from "@/lib/ai/agent-service-client";
import { requireSupabaseServerClient } from "@/lib/supabase/server";

async function token() {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("not_authenticated");
  return requireAccessToken();
}
export async function createBrowserSession(
  installationId: string,
  threadId: string,
  origin: string,
) {
  return agentServiceFetch<{
    id: string;
    pairing_code: string;
    origin: string;
    agent_name: string;
  }>("/v1/browser/sessions", {
    method: "POST",
    accessToken: await token(),
    body: { installation_id: installationId, thread_id: threadId, origin },
  });
}
export async function heartbeatBrowserSession(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("invalid_session");
  return agentServiceFetch<{
    state: string;
    agent_name: string;
    origin: string;
    expires_at: string;
  }>(`/v1/browser/sessions/${id}/heartbeat`, {
    method: "POST",
    accessToken: await token(),
  });
}
export async function revokeBrowserSession(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("invalid_session");
  return agentServiceFetch(`/v1/browser/sessions/${id}`, {
    method: "DELETE",
    accessToken: await token(),
  });
}
