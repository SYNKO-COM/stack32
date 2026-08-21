import { requireSupabaseBrowserClient } from "@/lib/supabase/client";

export const AGENT_AVATAR_BUCKET = "agent-avatars";
export const AGENT_AVATAR_MAX_BYTES = 30 * 1024 * 1024;
export const AGENT_AVATAR_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export const AGENT_PRESET_ICON_KEYS = [
  "briefcase",
  "search",
  "life-buoy",
  "pen-line",
  "file-text",
  "sparkles",
  "bot",
] as const;

/** Lucide preset key or public HTTPS image URL stored in agents.icon_key. */
export function isAgentIconImageUrl(icon: string | null | undefined): boolean {
  if (!icon) return false;
  return /^https?:\/\//i.test(icon) || icon.startsWith("data:image/");
}

export function isAllowedAgentIconValue(icon: string): boolean {
  if ((AGENT_PRESET_ICON_KEYS as readonly string[]).includes(icon)) return true;
  if (!/^https:\/\//i.test(icon)) return false;
  try {
    const url = new URL(icon);
    return url.pathname.includes(`/object/public/${AGENT_AVATAR_BUCKET}/`);
  } catch {
    return false;
  }
}

function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

/** Upload a profile image to the public agent-avatars bucket; returns the public URL. */
export async function uploadAgentAvatar(input: {
  agentId: string;
  file: File;
}): Promise<string> {
  if (!AGENT_AVATAR_MIME_TYPES.includes(input.file.type as (typeof AGENT_AVATAR_MIME_TYPES)[number])) {
    throw new Error("invalid_image_type");
  }
  if (input.file.size > AGENT_AVATAR_MAX_BYTES) {
    throw new Error("file_too_large");
  }

  const supabase = requireSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const ext = extensionForMime(input.file.type);
  const path = `${user.id}/${input.agentId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(AGENT_AVATAR_BUCKET).upload(path, input.file, {
    contentType: input.file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message || "upload_failed");

  const { data } = supabase.storage.from(AGENT_AVATAR_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error("upload_failed");
  return data.publicUrl;
}
