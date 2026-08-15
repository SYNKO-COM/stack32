"use server";

import {
  agentServiceFetch,
  requireAccessToken,
} from "@/lib/ai/agent-service-client";
import { currentAiExecutionMode } from "@/lib/ai/execution-adapter";

export async function startGoogleConnection(
  agentId: string,
  toolIds?: string[],
): Promise<{ authorizeUrl: string; state: string }> {
  if (currentAiExecutionMode() !== "agent-service") {
    throw new Error("connections_require_agent_service");
  }
  const accessToken = await requireAccessToken();
  const result = await agentServiceFetch<{ authorize_url: string; state: string }>(
    `/v1/connections/google/start`,
    {
      method: "POST",
      accessToken,
      body: {
        agent_id: agentId,
        tool_ids: toolIds && toolIds.length > 0 ? toolIds : [],
      },
    },
  );
  return { authorizeUrl: result.authorize_url, state: result.state };
}

export async function listAgentConnections(agentId: string): Promise<{
  bindings: Array<{ connection_id: string; tool_ids: string[]; enabled: boolean }>;
  connections: Array<{
    id: string;
    provider: string;
    status: string;
    account_email?: string;
    app_id?: string | null;
    provider_metadata?: Record<string, unknown> | null;
  }>;
}> {
  if (currentAiExecutionMode() !== "agent-service") {
    return { bindings: [], connections: [] };
  }
  const accessToken = await requireAccessToken();
  const result = await agentServiceFetch<{
    bindings: Array<{ connection_id: string; tool_ids: string[]; enabled: boolean }>;
    connections: Array<Record<string, unknown>>;
  }>(`/v1/agents/${agentId}/connections`, {
    method: "GET",
    accessToken,
  });
  return {
    bindings: result.bindings ?? [],
    connections: (result.connections ?? []).map((c) => {
      const meta =
        c.provider_metadata && typeof c.provider_metadata === "object"
          ? (c.provider_metadata as Record<string, unknown>)
          : null;
      const appFromMeta =
        meta && typeof meta.app_id === "string" ? meta.app_id : null;
      return {
        id: String(c.id ?? ""),
        provider: String(c.provider ?? ""),
        status: String(c.status ?? ""),
        account_email:
          typeof c.account_email === "string" ? c.account_email : undefined,
        app_id:
          c.provider === "google"
            ? "google"
            : appFromMeta,
        provider_metadata: meta,
      };
    }),
  };
}

export async function revokeConnection(connectionId: string): Promise<{ revoked: boolean }> {
  if (currentAiExecutionMode() !== "agent-service") {
    throw new Error("connections_require_agent_service");
  }
  const accessToken = await requireAccessToken();
  return agentServiceFetch(`/v1/connections/${connectionId}/revoke`, {
    method: "POST",
    accessToken,
  });
}

/** Disconnect one product app only (Calendar ≠ Gmail ≠ Notion). Immediate + durable. */
export async function disconnectAgentApp(input: {
  agentId: string;
  appId: string;
  toolIds?: string[];
  connectionId?: string;
}): Promise<{
  disconnected: boolean;
  app_id?: string;
  revoked?: string[];
  unbound_tools?: string[];
}> {
  if (currentAiExecutionMode() !== "agent-service") {
    throw new Error("connections_require_agent_service");
  }
  const accessToken = await requireAccessToken();
  return agentServiceFetch(`/v1/agents/${input.agentId}/connections/disconnect-app`, {
    method: "POST",
    accessToken,
    body: {
      app_id: input.appId,
      tool_ids: input.toolIds ?? [],
      connection_id: input.connectionId || null,
    },
  });
}
