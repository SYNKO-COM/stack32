import type { Workspace } from "@/lib/domain/types";
import { requireSupabaseBrowserClient } from "@/lib/supabase/client";
import type { WorkspaceRepository } from "@/lib/repositories/interfaces";

type WorkspaceRow = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

function mapWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseWorkspaceRepository implements WorkspaceRepository {
  async listWorkspaces(): Promise<Workspace[]> {
    const supabase = requireSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("workspaces")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data as WorkspaceRow[]).map(mapWorkspace);
  }

  async getWorkspace(workspaceId: string): Promise<Workspace | null> {
    const supabase = requireSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("workspaces")
      .select("*")
      .eq("id", workspaceId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapWorkspace(data as WorkspaceRow) : null;
  }

  async createWorkspace(name: string): Promise<Workspace> {
    const supabase = requireSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("create_workspace", {
      p_name: name,
    });
    if (error) {
      const { throwMappedPlanLimit } = await import("@/lib/billing/plan-limit");
      throwMappedPlanLimit(error);
    }
    return mapWorkspace(data as WorkspaceRow);
  }

  async renameWorkspace(workspaceId: string, name: string): Promise<Workspace> {
    const supabase = requireSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("workspaces")
      .update({ name: name.trim() })
      .eq("id", workspaceId)
      .select("*")
      .single();
    if (error) throw error;
    return mapWorkspace(data as WorkspaceRow);
  }
}
