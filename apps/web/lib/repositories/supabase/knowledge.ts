import type { KnowledgeSource } from "@/lib/domain/types";
import { mapKnowledgeSource } from "@/lib/domain/mappers";
import { requireSupabaseBrowserClient } from "@/lib/supabase/client";
import type { KnowledgeRepository } from "@/lib/repositories/interfaces";

export class SupabaseKnowledgeRepository implements KnowledgeRepository {
  async listSources(agentId: string): Promise<KnowledgeSource[]> {
    const supabase = requireSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("knowledge_sources")
      .select("*")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data.map(mapKnowledgeSource);
  }

  async addSource(
    agentId: string,
    name: string,
    kind: KnowledgeSource["kind"],
  ): Promise<KnowledgeSource> {
    const supabase = requireSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("not_authenticated");
    // Metadata only in Phase 2: no ingestion pipeline runs yet, so sources are
    // registered as "ready" placeholders (processing lands in Phase 6).
    const { data, error } = await supabase
      .from("knowledge_sources")
      .insert({
        agent_id: agentId,
        user_id: user.id,
        source_type: kind,
        name,
        status: "ready",
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapKnowledgeSource(data);
  }

  async removeSource(sourceId: string): Promise<void> {
    const supabase = requireSupabaseBrowserClient();
    const { error } = await supabase.from("knowledge_sources").delete().eq("id", sourceId);
    if (error) throw error;
  }
}
