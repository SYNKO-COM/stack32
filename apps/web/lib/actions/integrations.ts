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

export async function getConnectToken(appId?: string): Promise<ConnectTokenResult> {
  if (currentAiExecutionMode() !== "agent-service") {
    return {
      externalUserId: "local",
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

export async function syncIntegrationAccounts(input: {
  appId?: string;
  agentId?: string;
  toolIds?: string[];
  connectionId?: string;
}): Promise<{ accounts: Array<Record<string, unknown>>; binding?: Record<string, unknown> }> {
  if (currentAiExecutionMode() !== "agent-service") {
    return { accounts: [] };
  }
  const accessToken = await requireAccessToken();
  return agentServiceFetch("/v1/integrations/accounts/sync", {
    method: "POST",
    accessToken,
    body: {
      ...(input.appId ? { app_id: input.appId } : {}),
      ...(input.agentId ? { agent_id: input.agentId } : {}),
      ...(input.toolIds ? { tool_ids: input.toolIds } : {}),
      ...(input.connectionId ? { connection_id: input.connectionId } : {}),
    },
  });
}

export async function listIntegrationAccounts(appId?: string): Promise<{
  accounts: Array<{
    connectionId: string;
    provider?: string;
    appId?: string;
    accountEmail?: string | null;
    status?: string;
  }>;
}> {
  if (currentAiExecutionMode() !== "agent-service") {
    return { accounts: [] };
  }
  const accessToken = await requireAccessToken();
  const params = new URLSearchParams();
  if (appId) params.set("app_id", appId);
  const q = params.toString();
  const result = await agentServiceFetch<{
    accounts: Array<Record<string, unknown>>;
  }>(`/v1/integrations/accounts${q ? `?${q}` : ""}`, {
    method: "GET",
    accessToken,
  });
  return {
    accounts: (result.accounts ?? []).map((row) => ({
      connectionId: String(row.connection_id ?? ""),
      provider: typeof row.provider === "string" ? row.provider : undefined,
      appId: typeof row.app_id === "string" ? row.app_id : undefined,
      accountEmail:
        typeof row.account_email === "string" ? row.account_email : null,
      status: typeof row.status === "string" ? row.status : undefined,
    })),
  };
}

export async function bindIntegrationConnection(input: {
  agentId: string;
  connectionId: string;
  toolIds: string[];
}): Promise<{ binding: Record<string, unknown> }> {
  const accessToken = await requireAccessToken();
  return agentServiceFetch("/v1/integrations/bindings", {
    method: "POST",
    accessToken,
    body: {
      agent_id: input.agentId,
      connection_id: input.connectionId,
      tool_ids: input.toolIds,
    },
  });
}

export async function getToolConfig(
  agentId: string,
  toolId: string,
): Promise<{
  config: Record<string, unknown> | null;
  schema: Record<string, unknown> | null;
  appHint: Record<string, unknown> | null;
  playbooks: Array<Record<string, unknown>>;
}> {
  if (currentAiExecutionMode() !== "agent-service") {
    return { config: null, schema: null, appHint: null, playbooks: [] };
  }
  const accessToken = await requireAccessToken();
  const result = await agentServiceFetch<{
    config: Record<string, unknown> | null;
    schema: Record<string, unknown> | null;
    app_hint?: Record<string, unknown> | null;
    playbooks?: Array<Record<string, unknown>>;
  }>(`/v1/agents/${agentId}/tools/${encodeURIComponent(toolId)}/config`, {
    method: "GET",
    accessToken,
  });
  return {
    config: result.config,
    schema: result.schema,
    appHint: result.app_hint ?? null,
    playbooks: result.playbooks ?? [],
  };
}

export async function saveToolConfig(
  agentId: string,
  toolId: string,
  config: Record<string, unknown>,
  connectionId?: string,
): Promise<{ ok: boolean }> {
  const accessToken = await requireAccessToken();
  return agentServiceFetch(`/v1/agents/${agentId}/tools/${encodeURIComponent(toolId)}/config`, {
    method: "PUT",
    accessToken,
    body: {
      config,
      ...(connectionId ? { connection_id: connectionId } : {}),
    },
  });
}

export async function getToolDynamicOptions(input: {
  toolId: string;
  prop: string;
  agentId?: string;
}): Promise<{ options: Array<{ value: unknown; label?: string }> }> {
  if (currentAiExecutionMode() !== "agent-service") {
    return { options: [] };
  }
  const accessToken = await requireAccessToken();
  const params = new URLSearchParams({ prop: input.prop });
  if (input.agentId) params.set("agent_id", input.agentId);
  return agentServiceFetch(
    `/v1/integrations/tools/${encodeURIComponent(input.toolId)}/options?${params}`,
    { method: "GET", accessToken },
  );
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

export interface IntegrationAppHit {
  appId: string;
  name: string;
  imgSrc?: string;
  summary?: string;
}

export async function searchIntegrationApps(
  q: string,
  limit = 20,
): Promise<{ query: string; apps: IntegrationAppHit[] }> {
  if (currentAiExecutionMode() !== "agent-service") {
    return { query: q, apps: [] };
  }
  const accessToken = await requireAccessToken();
  const params = new URLSearchParams({
    q: q.slice(0, 200),
    limit: String(Math.min(Math.max(limit, 1), 50)),
  });
  const result = await agentServiceFetch<{
    query: string;
    apps: Array<Record<string, unknown>>;
  }>(`/v1/integrations/apps/search?${params.toString()}`, {
    method: "GET",
    accessToken,
  });
  const apps = (result.apps ?? [])
    .map((row) => {
      const rec = asRecord(row);
      const appId = String(rec.app_id ?? rec.appId ?? rec.name_slug ?? rec.id ?? "");
      return {
        appId,
        name: typeof rec.name === "string" && rec.name ? rec.name : appId,
        imgSrc:
          typeof rec.img_src === "string"
            ? rec.img_src
            : typeof rec.imgSrc === "string"
              ? rec.imgSrc
              : undefined,
        summary: typeof rec.summary === "string" ? rec.summary : undefined,
      };
    })
    .filter((app) => Boolean(app.appId));
  return { query: result.query, apps };
}

/** Resolve exact Pipedream logo URLs for Structure nodes (app id → img_src). */
export async function lookupIntegrationAppIcons(
  appIds: string[],
): Promise<Record<string, string>> {
  const unique = [
    ...new Set(appIds.map((id) => id.trim().toLowerCase()).filter(Boolean)),
  ].slice(0, 24);
  if (unique.length === 0) return {};
  if (currentAiExecutionMode() !== "agent-service") return {};
  const out: Record<string, string> = {};
  try {
    const accessToken = await requireAccessToken();
    try {
      const params = new URLSearchParams({ ids: unique.join(",") });
      const result = await agentServiceFetch<{ icons?: Record<string, string> }>(
        `/v1/integrations/apps/icons?${params.toString()}`,
        { method: "GET", accessToken },
      );
      for (const [id, src] of Object.entries(result.icons ?? {})) {
        if (id && typeof src === "string" && src.startsWith("https://")) {
          out[id.toLowerCase()] = src;
        }
      }
    } catch {
      // Batch route missing/down — fall through to catalog search.
    }
    const missing = unique.filter((id) => !out[id]);
    for (const id of missing) {
      try {
        const params = new URLSearchParams({ q: id.slice(0, 200), limit: "20" });
        const result = await agentServiceFetch<{
          apps?: Array<Record<string, unknown>>;
        }>(`/v1/integrations/apps/search?${params.toString()}`, {
          method: "GET",
          accessToken,
        });
        for (const row of result.apps ?? []) {
          const rec = asRecord(row);
          const appId = String(rec.app_id ?? rec.appId ?? rec.name_slug ?? rec.id ?? "")
            .trim()
            .toLowerCase();
          const src =
            typeof rec.img_src === "string"
              ? rec.img_src
              : typeof rec.imgSrc === "string"
                ? rec.imgSrc
                : "";
          if (appId && src.startsWith("https://")) {
            if (!out[appId]) out[appId] = src;
            if (appId === id) break;
          }
        }
      } catch {
        // Keep going — other apps may still resolve.
      }
    }
    return out;
  } catch {
    return {};
  }
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

export interface IntegrationTriggerHit {
  triggerId: string;
  name: string;
  summary?: string;
  appId?: string;
}

export async function searchIntegrationTriggers(
  q: string,
  appId?: string,
  limit = 50,
): Promise<{ query: string; triggers: IntegrationTriggerHit[] }> {
  if (currentAiExecutionMode() !== "agent-service") {
    return { query: q, triggers: [] };
  }
  const accessToken = await requireAccessToken();
  const params = new URLSearchParams({
    q: q.slice(0, 200),
    limit: String(Math.min(Math.max(limit, 1), 100)),
  });
  if (appId) params.set("app_id", appId);
  const result = await agentServiceFetch<{
    query: string;
    triggers: Array<Record<string, unknown>>;
  }>(`/v1/integrations/triggers/search?${params.toString()}`, {
    method: "GET",
    accessToken,
  });
  const triggers = (result.triggers ?? [])
    .map((row) => {
      const rec = asRecord(row);
      const triggerId = String(rec.trigger_id ?? rec.triggerId ?? rec.id ?? rec.key ?? "");
      return {
        triggerId,
        name: typeof rec.name === "string" && rec.name ? rec.name : triggerId,
        summary: typeof rec.summary === "string" ? rec.summary : undefined,
        appId:
          typeof rec.app_id === "string"
            ? rec.app_id
            : typeof rec.appId === "string"
              ? rec.appId
              : undefined,
      };
    })
    .filter((row) => Boolean(row.triggerId));
  return { query: result.query, triggers };
}

export async function getIntegrationTriggerComponent(componentId: string): Promise<{
  found: boolean;
  name?: string;
  appId?: string;
  props: Array<{
    name: string;
    label: string;
    required: boolean;
    description?: string;
    type?: string;
    remote_options?: boolean;
  }>;
}> {
  if (currentAiExecutionMode() !== "agent-service" || !componentId) {
    return { found: false, props: [] };
  }
  const accessToken = await requireAccessToken();
  const result = await agentServiceFetch<{
    found?: boolean;
    name?: string;
    app_id?: string;
    props?: Array<Record<string, unknown>>;
  }>(`/v1/integrations/triggers/${encodeURIComponent(componentId)}`, {
    method: "GET",
    accessToken,
  });
  return {
    found: result.found === true,
    name: result.name,
    appId: result.app_id,
    props: (result.props ?? []).map((p) => ({
      name: String(p.name ?? ""),
      label: String(p.label ?? p.name ?? ""),
      required: p.required === true,
      description: typeof p.description === "string" ? p.description : undefined,
      type: typeof p.type === "string" ? p.type : undefined,
      remote_options: p.remote_options === true || p.remoteOptions === true,
    })).filter((p) => p.name),
  };
}

export async function getTriggerDynamicOptions(input: {
  componentId: string;
  prop: string;
  agentId?: string;
  appId?: string;
}): Promise<{ options: Array<{ value: unknown; label?: string }> }> {
  if (currentAiExecutionMode() !== "agent-service") {
    return { options: [] };
  }
  const accessToken = await requireAccessToken();
  const params = new URLSearchParams({ prop: input.prop });
  if (input.agentId) params.set("agent_id", input.agentId);
  if (input.appId) params.set("app_id", input.appId);
  return agentServiceFetch(
    `/v1/integrations/triggers/${encodeURIComponent(input.componentId)}/options?${params}`,
    { method: "GET", accessToken },
  );
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
  try {
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
  } catch {
    return { status: "unknown", checks: [], missingConnections: [], missingConfig: [] };
  }
}
