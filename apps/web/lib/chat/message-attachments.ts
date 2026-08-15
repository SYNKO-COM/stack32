/** Shared chat attachment helpers for Live / Builder. */

export type ChatAttachmentKind = "image" | "file";

export interface MessageAttachment {
  id: string;
  name: string;
  mimeType: string;
  kind: ChatAttachmentKind;
  /** Signed or public URL for display (and optionally for the model). */
  url?: string;
  bucket?: string;
  path?: string;
  sizeBytes?: number;
}

/** Image bytes sent to the agent-service for vision on the current turn. */
export interface ChatImagePayload {
  name: string;
  mimeType: string;
  /** Raw base64 (no data: prefix). */
  dataBase64: string;
}

const ATTACHED_BLOCK_RE =
  /(?:^|\n)\s*\[Attached (?:image|file|PDF):[^\]]*\](?:\n```[\s\S]*?```)?/gi;

/** Strip legacy placeholder blocks from displayed message text. */
export function stripAttachedPlaceholders(content: string): string {
  return content.replace(ATTACHED_BLOCK_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function safeStorageFileName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "file";
}
