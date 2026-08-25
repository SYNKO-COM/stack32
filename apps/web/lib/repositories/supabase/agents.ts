import type { Agent, AgentSpec, AgentVersion, PublishResult } from "@/lib/domain/types";
import { duplicateAgentAction } from "@/lib/actions/agents";
import { mapAgent, mapAgentVersion } from "@/lib/domain/mappers";
import { requireSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AgentRepository } from "@/lib/repositories/interfaces";

export class SupabaseAgentRepository implements AgentRepository {
  async listAgents(workspaceId?: string): Promise<Agent[]> {
    const supabase = requireSupabaseBrowserClient();
    let query = supabase.from("agents").select("*").order("updated_at", { ascending: false });
    if (workspaceId) query = query.eq("workspace_id", workspaceId);
    const { data, error } = await query;
    if (error) throw error;
    return data.map(mapAgent);
  }

  async getAgent(agentId: string): Promise<Agent | null> {
    const supabase = requireSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .eq("id", agentId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapAgent(data) : null;
  }

  async createAgent(input?: { name?: string; workspaceId?: string }): Promise<Agent> {
    const supabase = requireSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("create_agent_workspace", {
      p_name: input?.name,
      p_workspace_id: input?.workspaceId,
    });
    if (error) {
      const { throwMappedPlanLimit } = await import("@/lib/billing/plan-limit");
      throwMappedPlanLimit(error);
    }
    const result = data as { agent_id: string };
    const agent = await this.getAgent(result.agent_id);
    if (!agent) throw new Error("agent_creation_failed");
    return agent;
  }

  async renameAgent(agentId: string, name: string): Promise<Agent> {
    const supabase = requireSupabaseBrowserClient();
    const { nextAvailableSlug, preferredAgentSlug } = await import("@/lib/marketplace/slug");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const trimmed = name.trim();
    if (!trimmed) throw new Error("invalid_name");
    if (user) {
      const { data: siblings } = await supabase
        .from("agents")
        .select("id, name")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .neq("id", agentId);
      const clash = (siblings ?? []).some(
        (row) => String(row.name ?? "").trim().toLowerCase() === trimmed.toLowerCase(),
      );
      if (clash) throw new Error("duplicate_name");
    }
    let slug = preferredAgentSlug(trimmed);
    if (user) {
      slug = await nextAvailableSlug(slug, async (candidate) => {
        const { data: clash } = await supabase
          .from("agents")
          .select("id")
          .eq("user_id", user.id)
          .eq("slug", candidate)
          .is("deleted_at", null)
          .neq("id", agentId)
          .maybeSingle();
        return Boolean(clash);
      });
    }
    const { data, error } = await supabase
      .from("agents")
      .update({ name: trimmed, slug })
      .eq("id", agentId)
      .select("*")
      .single();
    if (error) throw error;
    return mapAgent(data);
  }

  async duplicateAgent(agentId: string): Promise<Agent> {
    try {
      const result = await duplicateAgentAction(agentId);
      if ("ok" in result && !result.ok) {
        const { PlanLimitError } = await import("@/lib/billing/plan-limit");
        throw new PlanLimitError(result.code);
      }
      const { agentId: copyId } = result as { agentId: string };
      const agent = await this.getAgent(copyId);
      if (!agent) throw new Error("duplicate_failed");
      return agent;
    } catch (error) {
      const { throwMappedPlanLimit } = await import("@/lib/billing/plan-limit");
      return throwMappedPlanLimit(error);
    }
  }

  async deleteAgent(agentId: string): Promise<void> {
    const supabase = requireSupabaseBrowserClient();
    const { error } = await supabase.rpc("soft_delete_agent", { p_agent_id: agentId });
    if (error) throw error;
  }

  async publishAgent(agentId: string): Promise<PublishResult> {
    const { publishAgentAction } = await import("@/lib/actions/agents");
    const { AgentServiceError } = await import("@/lib/ai/agent-service-errors");
    const { PlanLimitError } = await import("@/lib/billing/plan-limit");
    const result = await publishAgentAction(agentId);
    if ("ok" in result && result.ok === false) {
      if (result.code === "PLAN_PUBLISH_REQUIRED") {
        throw new PlanLimitError("PLAN_PUBLISH_REQUIRED");
      }
      throw new AgentServiceError(result.code, result.code, 403);
    }
    return result as PublishResult;
  }

  async getCurrentVersion(agentId: string): Promise<AgentVersion | null> {
    const supabase = requireSupabaseBrowserClient();
    const { data: agent } = await supabase
      .from("agents")
      .select("name, draft_version_id, published_version_id, status")
      .eq("id", agentId)
      .maybeSingle();
    if (!agent) return null;

    // Prefer published snapshot for published agents (works for consumers via RLS).
    const preferredId =
      agent.status === "published" && agent.published_version_id
        ? agent.published_version_id
        : agent.draft_version_id ?? agent.published_version_id;

    if (preferredId) {
      const { data } = await supabase
        .from("agent_versions")
        .select("*")
        .eq("id", preferredId)
        .maybeSingle();
      if (data) return mapAgentVersion(data, agent.name);
    }

    const { data: latest } = await supabase
      .from("agent_versions")
      .select("*")
      .eq("agent_id", agentId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    return latest ? mapAgentVersion(latest, agent.name) : null;
  }

  async getSpec(agentId: string): Promise<AgentSpec | null> {
    const version = await this.getCurrentVersion(agentId);
    return version?.spec ?? null;
  }
}
