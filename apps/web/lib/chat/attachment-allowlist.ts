/**
 * Chat attachment allowlist — keep UI, upload Content-Type, and Storage
 * `allowed_mime_types` in sync (see supabase migration attachments MIME).
 */

export const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
export const ATTACHMENT_MAX_FILES = 5;

/** HTML `accept` attribute for the file picker. */
export const ATTACHMENT_ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,application/pdf,.txt,.md,.csv,.json,.py,.ts,.tsx,.js,.jsx,.html,.css,.yml,.yaml,.toml,.xml";

/** MIME types accepted by Storage for the `attachments` bucket. */
export const ATTACHMENT_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "text/css",
  "text/javascript",
  "application/javascript",
  "application/json",
  "application/xml",
  "text/xml",
  "text/yaml",
  "application/x-yaml",
] as const;

export type AttachmentAllowedMime = (typeof ATTACHMENT_ALLOWED_MIME_TYPES)[number];

const EXT_TO_MIME: Record<string, AttachmentAllowedMime> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  cjs: "text/javascript",
  jsx: "text/javascript",
  // Browsers often omit types for source files — store as plain text.
  ts: "text/plain",
  tsx: "text/plain",
  py: "text/plain",
  toml: "text/plain",
  yml: "text/yaml",
  yaml: "text/yaml",
  xml: "application/xml",
};

const ALLOWED_SET = new Set<string>(ATTACHMENT_ALLOWED_MIME_TYPES);

function extensionOf(name: string): string {
  const base = name.trim().split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Resolve a Storage-safe Content-Type from the browser File.
 * Prefer a known extension mapping when the browser sends empty/octet-stream.
 */
export function resolveAttachmentMimeType(input: {
  name: string;
  type?: string | null;
}): AttachmentAllowedMime | null {
  const raw = (input.type || "").trim().toLowerCase();
  const ext = extensionOf(input.name);

  if (raw === "image/jpg") return "image/jpeg";

  if (raw && ALLOWED_SET.has(raw)) {
    return raw as AttachmentAllowedMime;
  }

  // image/* from picker — only keep common safe subtypes via extension
  if (raw.startsWith("image/") && ext && EXT_TO_MIME[ext]?.startsWith("image/")) {
    return EXT_TO_MIME[ext];
  }

  if (ext && EXT_TO_MIME[ext]) {
    return EXT_TO_MIME[ext];
  }

  return null;
}

export function isAllowedAttachmentFile(input: {
  name: string;
  type?: string | null;
  size: number;
}): boolean {
  if (input.size <= 0 || input.size > ATTACHMENT_MAX_BYTES) return false;
  return resolveAttachmentMimeType(input) !== null;
}
