"use server";

import {
  agentServiceFetch,
  requireAccessToken,
} from "@/lib/ai/agent-service-client";
import { currentAiExecutionMode } from "@/lib/ai/execution-adapter";
import type { AgentInstallation, InstallationStatus } from "@/lib/domain/types";
import { requireSupabaseServerClient } from "@/lib/supabase/server";

function mapInstallationRow(row: Record<string, unknown>): AgentInstallation {
  const statusRaw = String(row.status ?? "setup_required");
  const status: InstallationStatus =
    statusRaw === "ready" || statusRaw === "needs_attention" || statusRaw === "setup_required"
      ? statusRaw
      : "setup_required";
  return {
    id: String(row.id),
    agentId: String(row.agent_id ?? row.agentId ?? ""),
    userId: String(row.user_id ?? row.userId ?? ""),
    pinnedVersionId:
      typeof row.pinned_version_id === "string"
        ? row.pinned_version_id
        : typeof row.pinnedVersionId === "string"
          ? row.pinnedVersionId
          : undefined,
    status,
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : typeof row.createdAt === "string"
          ? row.createdAt
          : undefined,
    updatedAt:
      typeof row.updated_at === "string"
        ? row.updated_at
        : typeof row.updatedAt === "string"
          ? row.updatedAt
          : undefined,
  };
}

/**
 * Idempotent: returns the caller's installation for this agent definition,
 * creating one with status `setup_required` when missing.
 *
 * Prefer agent-service (`POST /v1/installations/get-or-create`). Falls back to
 * a direct Supabase insert when AI_EXECUTION_MODE is mock/disabled.
 * Table types for `agent_installations` may lag codegen — cast until regenerated.
 */
export async function getOrCreateInstallation(agentId: string): Promise<AgentInstallation> {
  if (!agentId) throw new Error("agent_id_required");

  if (currentAiExecutionMode() === "agent-service") {
    const accessToken = await requireAccessToken();
    const row = await agentServiceFetch<Record<string, unknown>>(
      `/v1/installations/get-or-create`,
      {
        method: "POST",
        accessToken,
        body: { agent_id: agentId },
      },
    );
    return mapInstallationRow(row);
  }

  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  // Generated Database types may not include agent_installations yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pending supabase codegen
  const installations = (supabase as any).from("agent_installations");

  const { data: existing } = await installations
    .select("*")
    .eq("agent_id", agentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return mapInstallationRow(existing as Record<string, unknown>);

  const { data: agent } = await supabase
    .from("agents")
    .select("id, draft_version_id, published_version_id")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent) throw new Error("agent_not_found");

  const { data: created, error } = await installations
    .insert({
      agent_id: agentId,
      user_id: user.id,
      pinned_version_id: agent.published_version_id ?? agent.draft_version_id ?? null,
      status: "setup_required",
    })
    .select("*")
    .single();
  if (error || !created) {
    const { data: raced } = await installations
      .select("*")
      .eq("agent_id", agentId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (raced) return mapInstallationRow(raced as Record<string, unknown>);
    throw error ?? new Error("installation_create_failed");
  }
  return mapInstallationRow(created as Record<string, unknown>);
}
