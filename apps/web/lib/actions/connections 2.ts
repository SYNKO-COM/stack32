"use server";

import {
  agentServiceFetch,
  requireAccessToken,
} from "@/lib/ai/agent-service-client";
import { currentAiExecutionMode } from "@/lib/ai/execution-adapter";

export async function startGoogleConnection(
  agentId: string,
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
      body: { agent_id: agentId, tool_ids: ["gmail", "calendar"] },
    },
  );
  return { authorizeUrl: result.authorize_url, state: result.state };
}

export async function listAgentConnections(agentId: string): Promise<{
  bindings: Array<{ connection_id: string; tool_ids: string[]; enabled: boolean }>;
  connections: Array<{ id: string; provider: string; status: string; account_email?: string }>;
}> {
  if (currentAiExecutionMode() !== "agent-service") {
    return { bindings: [], connections: [] };
  }
  const accessToken = await requireAccessToken();
  return agentServiceFetch(`/v1/agents/${agentId}/connections`, {
    method: "GET",
    accessToken,
  });
}
