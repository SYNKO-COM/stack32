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

    // Free plan: lifetime Live message cap.
    // Match agent-service: persist the tipping message, then gate the run
    // (count > max after insert). Further attempts keep the composer draft.
    const { PLANS, isPlanKey } = await import("@/lib/billing/plans");
    const { PlanLimitError } = await import("@/lib/billing/plan-limit");
    const { data: ent } = await supabase.rpc("resolve_user_entitlements", {
      p_user_id: user.id,
    });
    const entRow = Array.isArray(ent) ? ent[0] : ent;
    const planKeyRaw =
      entRow && typeof entRow === "object" && "plan_key" in entRow
        ? String((entRow as { plan_key: string }).plan_key)
        : "free";
    const plan = isPlanKey(planKeyRaw) ? PLANS[planKeyRaw] : PLANS.free;
    let usedLiveMessages = 0;
    if (plan.maxLiveMessages !== null) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("live_user_message_count")
        .eq("id", user.id)
        .maybeSingle();
      usedLiveMessages = Number(profile?.live_user_message_count ?? 0);
      if (usedLiveMessages > plan.maxLiveMessages) {
        throw new PlanLimitError("PLAN_LIVE_MESSAGE_LIMIT");
      }
    }

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

    // At/over free Live cap: keep the user bubble, skip the agent run.
    if (plan.maxLiveMessages !== null && usedLiveMessages >= plan.maxLiveMessages) {
      throw new PlanLimitError("PLAN_LIVE_MESSAGE_LIMIT", undefined, { persisted: true });
    }

    const promptForModel =
      text ||
      (prepared.imagePayloads.length
        ? "Please analyze the attached image(s)."
        : displayContent.trim() || "Hello");

    await executeLiveTurn({
      agentId,
      threadId,
      prompt: promptForModel,
      images: prepared.imagePayloads,
    }).catch(async (err) => {
      const { AgentServiceError } = await import("@/lib/ai/agent-service-errors");
      if (err instanceof AgentServiceError && err.code === "PLAN_LIVE_MESSAGE_LIMIT") {
        throw new PlanLimitError("PLAN_LIVE_MESSAGE_LIMIT", undefined, { persisted: true });
      }
      if (
        err instanceof AgentServiceError &&
        (err.code === "BUDGET_EXCEEDED" || err.code === "MODEL_BUDGET_EXCEEDED")
      ) {
        throw err;
      }
      throw err;
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
