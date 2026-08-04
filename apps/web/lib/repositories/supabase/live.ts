import type { LiveThread } from "@/lib/domain/types";
import { executeLiveTurn } from "@/lib/actions/live";
import { mapLiveMessage } from "@/lib/domain/mappers";
import { requireSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LiveRepository } from "@/lib/repositories/interfaces";

/** Page size for message history (pagination-ready). */
const MESSAGE_PAGE_SIZE = 200;

export class SupabaseLiveRepository implements LiveRepository {
  private async getOrCreateThreadId(agentId: string): Promise<string> {
    const supabase = requireSupabaseBrowserClient();
    const { data: existing } = await supabase
      .from("live_threads")
      .select("id")
      .eq("agent_id", agentId)
      .eq("is_archived", false)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existing) return existing.id;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("not_authenticated");
    const { data: created, error } = await supabase
      .from("live_threads")
      .insert({ agent_id: agentId, user_id: user.id })
      .select("id")
      .single();
    if (error) throw error;
    return created.id;
  }

  async getThread(agentId: string): Promise<LiveThread> {
    const supabase = requireSupabaseBrowserClient();
    const threadId = await this.getOrCreateThreadId(agentId);
    const { data, error } = await supabase
      .from("live_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(MESSAGE_PAGE_SIZE);
    if (error) throw error;
    return {
      id: threadId,
      agentId,
      messages: data.map(mapLiveMessage).filter((m) => m !== null),
    };
  }

  async sendMessage(agentId: string, content: string): Promise<void> {
    const supabase = requireSupabaseBrowserClient();
    const threadId = await this.getOrCreateThreadId(agentId);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("not_authenticated");

    const { error } = await supabase.from("live_messages").insert({
      thread_id: threadId,
      agent_id: agentId,
      user_id: user.id,
      role: "user",
      content,
    });
    if (error) throw error;

    void executeLiveTurn({ agentId, threadId, prompt: content });
  }

  async clearThread(agentId: string): Promise<void> {
    const supabase = requireSupabaseBrowserClient();
    const { data: existing } = await supabase
      .from("live_threads")
      .select("id")
      .eq("agent_id", agentId)
      .eq("is_archived", false);
    if (!existing || existing.length === 0) return;
    const { error } = await supabase
      .from("live_threads")
      .delete()
      .in(
        "id",
        existing.map((t) => t.id),
      );
    if (error) throw error;
  }
}
