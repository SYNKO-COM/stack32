import type { ComposerAttachment } from "@/components/shared/prompt-composer";
import { resolveAttachmentMimeType } from "@/lib/chat/attachment-allowlist";
import {
  fileToBase64,
  safeStorageFileName,
  type ChatImagePayload,
  type MessageAttachment,
} from "@/lib/chat/message-attachments";
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "attachments";
const SIGNED_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days for chat previews

export interface PreparedChatAttachments {
  /** Clean refs stored on the message metadata (for UI). */
  messageAttachments: MessageAttachment[];
  /** Image bytes for the current LLM turn. */
  imagePayloads: ChatImagePayload[];
}

/**
 * Upload composer files to the private attachments bucket and prepare
 * signed preview URLs + base64 vision payloads.
 */
export async function prepareChatAttachments(input: {
  supabase: SupabaseClient;
  userId: string;
  agentId: string;
  threadId: string;
  messageId: string;
  attachments: ComposerAttachment[];
  context: "live" | "builder";
}): Promise<PreparedChatAttachments> {
  const messageAttachments: MessageAttachment[] = [];
  const imagePayloads: ChatImagePayload[] = [];

  for (const att of input.attachments) {
    if (!att.file) continue;
    const mime =
      resolveAttachmentMimeType({ name: att.name, type: att.mimeType || att.file.type }) ??
      null;
    if (!mime) {
      console.warn("attachment rejected: mime not allowed", att.name, att.mimeType);
      continue;
    }
    const attachmentId = crypto.randomUUID();
    const path = `${input.userId}/${input.agentId}/${input.threadId}/${attachmentId}/${safeStorageFileName(att.name)}`;

    const { error: uploadError } = await input.supabase.storage
      .from(BUCKET)
      .upload(path, att.file, {
        contentType: mime,
        upsert: false,
      });
    if (uploadError) {
      console.warn("attachment upload failed", uploadError.message);
      continue;
    }

    const { data: signed } = await input.supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_TTL_SECONDS);

    const row: Record<string, unknown> = {
      id: attachmentId,
      user_id: input.userId,
      agent_id: input.agentId,
      storage_bucket: BUCKET,
      storage_path: path,
      original_name: att.name,
      mime_type: mime,
      size_bytes: att.size,
      status: "uploaded",
      metadata: { kind: att.kind },
    };
    if (input.context === "live") {
      row.live_thread_id = input.threadId;
      row.live_message_id = input.messageId;
    } else {
      row.builder_thread_id = input.threadId;
      row.builder_message_id = input.messageId;
    }
    const { error: insertError } = await input.supabase.from("attachments").insert(row);
    if (insertError) {
      console.warn("attachment row insert failed", insertError.message);
    }

    messageAttachments.push({
      id: attachmentId,
      name: att.name,
      mimeType: mime,
      kind: att.kind,
      url: signed?.signedUrl,
      bucket: BUCKET,
      path,
      sizeBytes: att.size,
    });

    if (att.kind === "image") {
      try {
        imagePayloads.push({
          name: att.name,
          mimeType: mime,
          dataBase64: await fileToBase64(att.file),
        });
      } catch (err) {
        console.warn("image base64 encode failed", err);
      }
    }
  }

  return { messageAttachments, imagePayloads };
}

/** Refresh signed URLs for attachments stored by path on a message. */
export async function signMessageAttachments(
  supabase: SupabaseClient,
  attachments: MessageAttachment[] | undefined,
): Promise<MessageAttachment[]> {
  if (!attachments?.length) return [];
  const out: MessageAttachment[] = [];
  for (const att of attachments) {
    if (att.url && !att.path) {
      out.push(att);
      continue;
    }
    if (!att.path || !att.bucket) {
      out.push(att);
      continue;
    }
    const { data } = await supabase.storage
      .from(att.bucket)
      .createSignedUrl(att.path, SIGNED_TTL_SECONDS);
    out.push({ ...att, url: data?.signedUrl ?? att.url });
  }
  return out;
}
