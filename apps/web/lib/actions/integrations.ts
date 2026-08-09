"use server";

import {
  agentServiceFetch,
  requireAccessToken,
} from "@/lib/ai/agent-service-client";
import { currentAiExecutionMode } from "@/lib/ai/execution-adapter";

export interface ConnectTokenResult {
  externalUserId: string;
  token?: string | null;
  connectLinkUrl?: string | null;
  expiresAt?: string | null;
  degraded?: boolean;
  message?: string;
  raw?: Record<string, unknown>;
}

export interface IntegrationToolBrief {
  toolId: string;
  name?: string;
  provider?: string;
  appId?: string;
  summary?: string;
  connectionRequired?: boolean;
  approvalMode?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function getConnectToken(
  externalUserId?: string,
  appId?: string,
): Promise<ConnectTokenResult> {
  if (currentAiExecutionMode() !== "agent-service") {
    return {
      externalUserId: externalUserId ?? "local",
      degraded: true,
      message: "integrations_require_agent_service",
    };
  }
  const accessToken = await requireAccessToken();
  const result = await agentServiceFetch<{
    external_user_id: string;
    app_id?: string | null;
    connect: Record<string, unknown> | null;
  }>("/v1/integrations/connect-token", {
    method: "POST",
    accessToken,
    body: {
      ...(externalUserId ? { external_user_id: externalUserId } : {}),
      ...(appId ? { app_id: appId } : {}),
    },
  });
  const connect = asRecord(result.connect);
  const token =
    typeof connect.token === "string"
      ? connect.token
      : typeof connect.connect_token === "string"
        ? connect.connect_token
        : null;
  let connectLinkUrl =
    typeof connect.connect_link_url === "string"
      ? connect.connect_link_url
      : typeof connect.connectLinkUrl === "string"
        ? connect.connectLinkUrl
        : null;
  if (appId && connectLinkUrl && !connectLinkUrl.includes("app=")) {
    connectLinkUrl = `${connectLinkUrl}${connectLinkUrl.includes("?") ? "&" : "?"}app=${encodeURIComponent(appId)}`;
  }
  return {
    externalUserId: result.external_user_id,
    token,
    connectLinkUrl,
    expiresAt:
      typeof connect.expires_at === "string"
        ? connect.expires_at
        : typeof connect.expiresAt === "string"
          ? connect.expiresAt
          : null,
    degraded: connect.degraded === true || !token,
    message: typeof connect.message === "string" ? connect.message : undefined,
    raw: connect,
  };
}

export async function searchIntegrationTools(
  q: string,
  limit = 20,
): Promise<{ query: string; tools: IntegrationToolBrief[] }> {
  if (currentAiExecutionMode() !== "agent-service") {
    return { query: q, tools: [] };
  }
  const accessToken = await requireAccessToken();
  const params = new URLSearchParams({
    q: q.slice(0, 200),
    limit: String(Math.min(Math.max(limit, 1), 50)),
  });
  const result = await agentServiceFetch<{
    query: string;
    tools: Array<Record<string, unknown>>;
  }>(`/v1/integrations/tools/search?${params.toString()}`, {
    method: "GET",
    accessToken,
  });
  return {
    query: result.query,
    tools: (result.tools ?? []).map((row) => {
      const rec = asRecord(row);
      return {
        toolId: String(rec.tool_id ?? rec.toolId ?? ""),
        name: typeof rec.name === "string" ? rec.name : undefined,
        provider: typeof rec.provider === "string" ? rec.provider : undefined,
        appId:
          typeof rec.app_id === "string"
            ? rec.app_id
            : typeof rec.appId === "string"
              ? rec.appId
              : undefined,
        summary: typeof rec.summary === "string" ? rec.summary : undefined,
        connectionRequired:
          rec.connection_required === true || rec.connectionRequired === true,
        approvalMode:
          typeof rec.approval_mode === "string"
            ? rec.approval_mode
            : typeof rec.approvalMode === "string"
              ? rec.approvalMode
              : undefined,
      };
    }),
  };
}

export async function getProvidersHealth(): Promise<{
  providers: Array<Record<string, unknown>>;
  llm: Array<Record<string, unknown>>;
}> {
  if (currentAiExecutionMode() !== "agent-service") {
    return { providers: [], llm: [] };
  }
  const accessToken = await requireAccessToken();
  return agentServiceFetch("/v1/providers/health", {
    method: "GET",
    accessToken,
  });
}

export async function getAgentReadiness(agentId: string): Promise<{
  status: string;
  agentStatus?: string;
  checks: Array<{ key: string; ok: boolean; message: string; severity: string }>;
  missingConnections: Array<Record<string, unknown>>;
  missingConfig: Array<Record<string, unknown>>;
}> {
  if (currentAiExecutionMode() !== "agent-service") {
    return { status: "unknown", checks: [], missingConnections: [], missingConfig: [] };
  }
  const accessToken = await requireAccessToken();
  const result = await agentServiceFetch<{
    status: string;
    agent_status?: string;
    checks?: Array<Record<string, unknown>>;
    missing_connections?: Array<Record<string, unknown>>;
    missing_config?: Array<Record<string, unknown>>;
  }>(`/v1/agents/${agentId}/readiness`, {
    method: "GET",
    accessToken,
  });
  return {
    status: result.status,
    agentStatus: result.agent_status,
    checks: (result.checks ?? []).map((c) => ({
      key: String(c.key ?? ""),
      ok: c.ok === true,
      message: String(c.message ?? ""),
      severity: String(c.severity ?? "info"),
    })),
    missingConnections: result.missing_connections ?? [],
    missingConfig: result.missing_config ?? [],
  };
}
