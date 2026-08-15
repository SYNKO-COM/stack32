"use server";

import {
  agentServiceFetch,
  requireAccessToken,
} from "@/lib/ai/agent-service-client";
import { currentAiExecutionMode } from "@/lib/ai/execution-adapter";
import { mapAgent, mapGraphSpecFromApi, mapIdentityFromApi } from "@/lib/domain/mappers";
import type { Agent, AgentGraphResponse } from "@/lib/domain/types";
import { requireSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Duplicates an agent (agent row + latest version + fresh builder thread).
 * Runs entirely in the caller's RLS context: only owned agents are reachable
 * and the copy is always owned by the caller.
 */
export async function duplicateAgentAction(agentId: string): Promise<{ agentId: string }> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const { data: source } = await supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .maybeSingle();
  if (!source) throw new Error("agent_not_found");

  const baseSlug = `${source.slug}-copy`;
  let slug = baseSlug;
  for (let suffix = 2; ; suffix++) {
    const { data: existing } = await supabase
      .from("agents")
      .select("id")
      .eq("slug", slug)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${suffix}`;
  }

  const { data: copy, error: copyError } = await supabase
    .from("agents")
    .insert({
      user_id: user.id,
      workspace_id: source.workspace_id,
      name: `${source.name} (copy)`,
      slug,
      description: source.description,
      icon_key: source.icon_key,
      status: "draft",
    })
    .select("id")
    .single();
  if (copyError || !copy) throw copyError ?? new Error("duplicate_failed");

  const { data: sourceVersion } = await supabase
    .from("agent_versions")
    .select("*")
    .eq("agent_id", agentId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sourceVersion) {
    const { data: version } = await supabase
      .from("agent_versions")
      .insert({
        agent_id: copy.id,
        version_number: 1,
        spec: sourceVersion.spec,
        change_summary: "Duplicated from existing agent",
        source_prompt: sourceVersion.source_prompt,
        validation_status: sourceVersion.validation_status,
        test_status: sourceVersion.test_status,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (version) {
      await supabase.from("agents").update({ draft_version_id: version.id }).eq("id", copy.id);
    }
  }

  await supabase.from("builder_threads").insert({ agent_id: copy.id, user_id: user.id });
  await supabase.from("live_threads").insert({ agent_id: copy.id, user_id: user.id });

  return { agentId: copy.id };
}

/**
 * Publishes the agent's current draft version.
 *
 * - `agent-service` mode: calls Agent API publish gates (spec/graph/compile/smoke).
 * - `mock` / `disabled`: direct Supabase flip (dev only — no validation gates).
 */
export async function publishAgentAction(agentId: string): Promise<Agent> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const { data: owned } = await supabase
    .from("agents")
    .select("id, draft_version_id")
    .eq("id", agentId)
    .maybeSingle();
  if (!owned) throw new Error("agent_not_found");

  if (currentAiExecutionMode() === "agent-service") {
    const accessToken = await requireAccessToken();
    await agentServiceFetch(`/v1/agents/${agentId}/publish`, {
      method: "POST",
      accessToken,
      body: {},
    });
  } else {
    if (!owned.draft_version_id) throw new Error("no_draft_version");
    const { error } = await supabase
      .from("agents")
      .update({ status: "published", published_version_id: owned.draft_version_id })
      .eq("id", agentId);
    if (error) throw error;
  }

  const { data: agent, error: readError } = await supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .single();
  if (readError || !agent) throw readError ?? new Error("agent_not_found");
  return mapAgent(agent);
}

/** Fetches the execution graph for Structure view. */
export async function getAgentGraphAction(agentId: string): Promise<AgentGraphResponse | null> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const { data: owned } = await supabase
    .from("agents")
    .select("id, draft_version_id")
    .eq("id", agentId)
    .maybeSingle();
  if (!owned) throw new Error("agent_not_found");

  if (currentAiExecutionMode() === "agent-service") {
    const accessToken = await requireAccessToken();
    const result = await agentServiceFetch<{
      graph: unknown;
      schema_version?: string | null;
      identity?: unknown;
      test_ready?: boolean;
    }>(`/v1/agents/${agentId}/graph`, { accessToken });
    return {
      graph: result.graph ? mapGraphSpecFromApi(result.graph) : null,
      schemaVersion: result.schema_version ?? null,
      identity: result.identity ? mapIdentityFromApi(result.identity) ?? null : null,
      testReady: result.test_ready,
    };
  }

  if (!owned.draft_version_id) return null;

  const { data: version } = await supabase
    .from("agent_versions")
    .select("spec")
    .eq("id", owned.draft_version_id)
    .maybeSingle();

  if (!version) return null;

  const specRaw = version.spec as Record<string, unknown>;
  const graphRaw = specRaw.graph ?? specRaw.graph_spec;
  return {
    graph: graphRaw ? mapGraphSpecFromApi(graphRaw) : null,
    schemaVersion:
      typeof specRaw.schema_version === "string"
        ? specRaw.schema_version
        : typeof specRaw.schemaVersion === "string"
          ? specRaw.schemaVersion
          : null,
  };
}

export async function listAgentProjectFiles(
  agentId: string,
): Promise<Array<{ path: string; checksum?: string; updated_at?: string }>> {
  if (currentAiExecutionMode() !== "agent-service") return [];
  const accessToken = await requireAccessToken();
  const result = await agentServiceFetch<{
    files: Array<{ path: string; checksum?: string; updated_at?: string }>;
  }>(`/v1/agents/${agentId}/project/files`, { method: "GET", accessToken });
  return result.files ?? [];
}

export type ProjectStructureNode = {
  id: string;
  label: string;
  type: string;
  file: string;
  config?: Record<string, unknown>;
  binding?: {
    connection_id?: string;
    provider?: string;
    enabled?: boolean;
  } | null;
};

export type ProjectStructure = {
  nodes: ProjectStructureNode[];
  edges: Array<{ source: string; target: string }>;
  source?: string;
  pattern?: string | null;
  runtime_version?: string | null;
};

export async function getAgentProjectStructureAction(
  agentId: string,
): Promise<{ structure: ProjectStructure | null; snapshotId: string | null }> {
  if (currentAiExecutionMode() !== "agent-service") {
    return { structure: null, snapshotId: null };
  }
  const accessToken = await requireAccessToken();
  const result = await agentServiceFetch<{
    structure: ProjectStructure | null;
    snapshot_id?: string | null;
  }>(`/v1/agents/${agentId}/project/structure`, { method: "GET", accessToken });
  return {
    structure: result.structure ?? null,
    snapshotId: result.snapshot_id ?? null,
  };
}

export async function getSnapshotFileAction(
  agentId: string,
  snapshotId: string,
  path: string,
): Promise<{ path: string; content: string; content_type?: string } | null> {
  if (currentAiExecutionMode() !== "agent-service") return null;
  const accessToken = await requireAccessToken();
  const encoded = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const result = await agentServiceFetch<{
    file: { path: string; content: string; content_type?: string };
  }>(`/v1/agents/${agentId}/snapshots/${snapshotId}/files/${encoded}`, {
    method: "GET",
    accessToken,
  });
  return result.file ?? null;
}

export async function listAgentSecretsMeta(
  agentId: string,
): Promise<Array<{ secret_kind?: string; provider?: string; key_hint?: string }>> {
  if (currentAiExecutionMode() !== "agent-service") return [];
  const accessToken = await requireAccessToken();
  const result = await agentServiceFetch<{
    secrets: Array<{ secret_kind?: string; provider?: string; key_hint?: string }>;
  }>(`/v1/agents/${agentId}/secrets`, { method: "GET", accessToken });
  return result.secrets ?? [];
}
