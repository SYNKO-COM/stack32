import "server-only";

import { getServerEnv } from "@/lib/env.server";
import { AgentServiceError } from "@/lib/ai/agent-service-errors";
import { requireSupabaseServerClient } from "@/lib/supabase/server";

export { AgentServiceError } from "@/lib/ai/agent-service-errors";
export { agentServiceErrorKey } from "@/lib/ai/agent-service-errors";

export async function requireAccessToken(): Promise<string> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("not_authenticated");
  return session.access_token;
}

interface AgentServiceFetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  accessToken: string;
}

/**
 * Server-only fetch helper for the Agent Service API.
 * Paths must start with `/v1/…`.
 */
export async function agentServiceFetch<T>(
  path: string,
  options: AgentServiceFetchOptions,
): Promise<T> {
  const { AGENT_SERVICE_URL } = getServerEnv();
  const url = `${AGENT_SERVICE_URL.replace(/\/$/, "")}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
  } catch (err) {
    const cause =
      err instanceof Error && "cause" in err
        ? (err as Error & { cause?: { code?: string } }).cause
        : undefined;
    const code =
      cause && typeof cause === "object" && "code" in cause
        ? String((cause as { code?: string }).code || "")
        : "";
    if (code === "ECONNREFUSED" || (err instanceof Error && /fetch failed/i.test(err.message))) {
      throw new AgentServiceError(
        "AGENT_SERVICE_UNAVAILABLE",
        "Agent service is not reachable.",
        503,
      );
    }
    throw err;
  }

  if (!res.ok) {
    let code = "AGENT_SERVICE_ERROR";
    let message = "Agent service request failed";
    try {
      const data = (await res.json()) as {
        detail?: { code?: string; message?: string } | string;
      };
      if (typeof data.detail === "object" && data.detail !== null) {
        if (typeof data.detail.code === "string") code = data.detail.code;
        if (typeof data.detail.message === "string") message = data.detail.message;
      } else if (typeof data.detail === "string") {
        message = data.detail;
      }
    } catch {
      // Non-JSON error body — keep generic message.
    }
    throw new AgentServiceError(code, message, res.status);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
