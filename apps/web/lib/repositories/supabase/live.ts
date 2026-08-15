import type { ComposerAttachment } from "@/components/shared/prompt-composer";
import type { LiveThread } from "@/lib/domain/types";
import { executeLiveTurn } from "@/lib/actions/live";
import { prepareChatAttachments, signMessageAttachments } from "@/lib/chat/prepare-attachments";
import { mapLiveMessage } from "@/lib/domain/mappers";
import { requireSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LiveRepository } from "@/lib/repositories/interfaces";
import type { Json } from "@/lib/supabase/database.types";

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
    const messages = (
      await Promise.all(
        data.map(async (row) => {
          const mapped = mapLiveMessage(row);
          if (!mapped?.attachments?.length) return mapped;
          return {
            ...mapped,
            attachments: await signMessageAttachments(supabase, mapped.attachments),
          };
        }),
      )
    ).filter((m): m is NonNullable<typeof m> => m !== null);
    return {
      id: threadId,
      agentId,
      messages,
    };
  }

  async sendMessage(
    agentId: string,
    content: string,
    attachments: ComposerAttachment[] = [],
  ): Promise<void> {
    const supabase = requireSupabaseBrowserClient();
    const threadId = await this.getOrCreateThreadId(agentId);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("not_authenticated");

    const messageId = crypto.randomUUID();
    const text = content.trim();
    const prepared =
      attachments.length > 0
        ? await prepareChatAttachments({
            supabase,
            userId: user.id,
            agentId,
            threadId,
            messageId,
            attachments,
            context: "live",
          })
        : { messageAttachments: [], imagePayloads: [] };

    const displayContent =
      text ||
      (prepared.messageAttachments.some((a) => a.kind === "image")
        ? ""
        : prepared.messageAttachments.length
          ? prepared.messageAttachments.map((a) => a.name).join(", ")
          : "");

    // Persist clean user text — never the old [Attached image: …] placeholder.
    const { error } = await supabase.from("live_messages").insert({
      id: messageId,
      thread_id: threadId,
      agent_id: agentId,
      user_id: user.id,
      role: "user",
      content: displayContent,
      metadata: {
        attachments: prepared.messageAttachments,
      } as unknown as Json,
    });
    if (error) throw error;

    const promptForModel =
      text ||
      (prepared.imagePayloads.length
        ? "Please analyze the attached image(s)."
        : displayContent.trim() || "Hello");

    void executeLiveTurn({
      agentId,
      threadId,
      prompt: promptForModel,
      images: prepared.imagePayloads,
    });
  }

  async clearThread(agentId: string): Promise<void> {
    // Stop any in-flight / waiting live run so Structure returns to idle and
    // the agent cannot keep writing into a deleted conversation.
    try {
      const { cancelLiveRun } = await import("@/lib/actions/live");
      await cancelLiveRun({ agentId, silent: true });
    } catch {
      // Best-effort: still delete the thread even if cancel fails.
    }

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
