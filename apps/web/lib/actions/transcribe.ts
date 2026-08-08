"use server";

import {
  agentServiceFetch,
  requireAccessToken,
} from "@/lib/ai/agent-service-client";

export async function transcribeAudioAction(input: {
  audioBase64: string;
  mimeType: string;
  language?: string;
}): Promise<{ text: string }> {
  const accessToken = await requireAccessToken();
  return agentServiceFetch<{ text: string }>("/v1/transcribe", {
    method: "POST",
    accessToken,
    body: {
      audio_base64: input.audioBase64,
      mime_type: input.mimeType,
      language: input.language,
    },
  });
}
