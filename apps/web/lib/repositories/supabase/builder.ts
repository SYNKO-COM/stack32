import type { ComposerAttachment } from "@/components/shared/prompt-composer";
import type { BuilderThread } from "@/lib/domain/types";
import { executeBuilderRepair, executeBuilderTurn } from "@/lib/actions/builder";
import { prepareChatAttachments, signMessageAttachments } from "@/lib/chat/prepare-attachments";
import { mapBuilderMessage } from "@/lib/domain/mappers";
import { requireSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BuilderRepository } from "@/lib/repositories/interfaces";
import type { Json } from "@/lib/supabase/database.types";

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
    const messages = (
      await Promise.all(
        data.map(async (row) => {
          const mapped = mapBuilderMessage(row);
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
    mode: "build" | "chat" = "build",
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
            context: "builder",
          })
        : { messageAttachments: [], imagePayloads: [] };

    const displayContent =
      text ||
      (prepared.messageAttachments.some((a) => a.kind === "image")
        ? ""
        : prepared.messageAttachments.length
          ? prepared.messageAttachments.map((a) => a.name).join(", ")
          : "");

    const { error } = await supabase.from("builder_messages").insert({
      id: messageId,
      thread_id: threadId,
      agent_id: agentId,
      user_id: user.id,
      role: "user",
      content: displayContent,
      metadata: {
        attachments: prepared.messageAttachments,
        mode,
      } as unknown as Json,
    });
    if (error) throw error;

    const promptForModel =
      text ||
      (prepared.imagePayloads.length
        ? "Please analyze the attached image(s) and help me build from them."
        : displayContent.trim() || "Hello");

    void executeBuilderTurn({
      agentId,
      threadId,
      prompt: promptForModel,
      images: prepared.imagePayloads,
      mode,
    });
  }

  async repairAgent(agentId: string): Promise<void> {
    const threadId = await this.getOrCreateThreadId(agentId);
    void executeBuilderRepair({ agentId, threadId });
  }
}
