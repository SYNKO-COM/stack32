import type { BuilderThread } from "@/lib/domain/types";
import { executeBuilderRepair, executeBuilderTurn } from "@/lib/actions/builder";
import { mapBuilderMessage } from "@/lib/domain/mappers";
import { requireSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BuilderRepository } from "@/lib/repositories/interfaces";

/** Page size for message history (pagination-ready). */
const MESSAGE_PAGE_SIZE = 200;

export class SupabaseBuilderRepository implements BuilderRepository {
  private async getOrCreateThreadId(agentId: string): Promise<string> {
    const supabase = requireSupabaseBrowserClient();
    const { data: existing } = await supabase
      .from("builder_threads")
      .select("id")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existing) return existing.id;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("not_authenticated");
    const { data: created, error } = await supabase
      .from("builder_threads")
      .insert({ agent_id: agentId, user_id: user.id })
      .select("id")
      .single();
    if (error) throw error;
    return created.id;
  }

  async getThread(agentId: string): Promise<BuilderThread> {
    const supabase = requireSupabaseBrowserClient();
    const threadId = await this.getOrCreateThreadId(agentId);
    const { data, error } = await supabase
      .from("builder_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(MESSAGE_PAGE_SIZE);
    if (error) throw error;
    return {
      id: threadId,
      agentId,
      messages: data.map(mapBuilderMessage).filter((m) => m !== null),
    };
  }

  async sendMessage(agentId: string, content: string): Promise<void> {
    const supabase = requireSupabaseBrowserClient();
    const threadId = await this.getOrCreateThreadId(agentId);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("not_authenticated");

    // The client may only insert its own user-role messages (enforced by RLS).
    const { error } = await supabase.from("builder_messages").insert({
      thread_id: threadId,
      agent_id: agentId,
      user_id: user.id,
      role: "user",
      content,
    });
    if (error) throw error;

    // Assistant simulation runs through trusted server code (fire and forget:
    // the UI polls/subscribes for progressive updates).
    void executeBuilderTurn({ agentId, threadId, prompt: content });
  }

  async repairAgent(agentId: string): Promise<void> {
    const threadId = await this.getOrCreateThreadId(agentId);
    void executeBuilderRepair({ agentId, threadId });
  }
}
