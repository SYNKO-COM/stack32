import type { Agent, AgentSpec, AgentVersion } from "@/lib/domain/types";
import { duplicateAgentAction } from "@/lib/actions/agents";
import { mapAgent, mapAgentVersion } from "@/lib/domain/mappers";
import { requireSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AgentRepository } from "@/lib/repositories/interfaces";

export class SupabaseAgentRepository implements AgentRepository {
  async listAgents(): Promise<Agent[]> {
    const supabase = requireSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .order("updated_at", { ascending: false });
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

  async createAgent(name?: string): Promise<Agent> {
    const supabase = requireSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("create_agent_workspace", {
      p_name: name,
    });
    if (error) throw error;
    const result = data as { agent_id: string };
    const agent = await this.getAgent(result.agent_id);
    if (!agent) throw new Error("agent_creation_failed");
    return agent;
  }

  async renameAgent(agentId: string, name: string): Promise<Agent> {
    const supabase = requireSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("agents")
      .update({ name })
      .eq("id", agentId)
      .select("*")
      .single();
    if (error) throw error;
    return mapAgent(data);
  }

  async duplicateAgent(agentId: string): Promise<Agent> {
    const { agentId: copyId } = await duplicateAgentAction(agentId);
    const agent = await this.getAgent(copyId);
    if (!agent) throw new Error("duplicate_failed");
    return agent;
  }

  async deleteAgent(agentId: string): Promise<void> {
    const supabase = requireSupabaseBrowserClient();
    const { error } = await supabase.rpc("soft_delete_agent", { p_agent_id: agentId });
    if (error) throw error;
  }

  async publishAgent(agentId: string): Promise<Agent> {
    const supabase = requireSupabaseBrowserClient();
    const { data: current, error: readError } = await supabase
      .from("agents")
      .select("draft_version_id")
      .eq("id", agentId)
      .single();
    if (readError) throw readError;
    const { data, error } = await supabase
      .from("agents")
      .update({ status: "published", published_version_id: current.draft_version_id })
      .eq("id", agentId)
      .select("*")
      .single();
    if (error) throw error;
    return mapAgent(data);
  }

  async getCurrentVersion(agentId: string): Promise<AgentVersion | null> {
    const supabase = requireSupabaseBrowserClient();
    const { data: agent } = await supabase
      .from("agents")
      .select("name, draft_version_id")
      .eq("id", agentId)
      .maybeSingle();
    if (!agent) return null;

    if (agent.draft_version_id) {
      const { data } = await supabase
        .from("agent_versions")
        .select("*")
        .eq("id", agent.draft_version_id)
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
