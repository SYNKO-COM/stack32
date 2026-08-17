import type { IntegrationIconRef } from "@/lib/domain/product-agent-graph";

const LOCAL_PROVIDER_ICONS: Record<string, string> = {
  openai: "/llm-providers/openai.svg",
  anthropic: "/llm-providers/anthropic.svg",
  google: "/llm-providers/gemini.svg",
  gemini: "/llm-providers/gemini.svg",
  xai: "/llm-providers/xai.svg",
  mistral: "/llm-providers/mistral.svg",
  groq: "/llm-providers/groq.svg",
  openrouter: "/llm-providers/openrouter.svg",
  gmail: "/integrations/gmail.svg",
  google_calendar: "/integrations/google-calendar.svg",
  google_docs: "/integrations/google-docs.svg",
};

const metadataCache = new Map<string, string>();

export function cacheIntegrationIcon(appKey: string, imgSrc: string): void {
  if (appKey && imgSrc) metadataCache.set(appKey.toLowerCase(), imgSrc);
}

export function getCachedIntegrationIcon(appKey: string): string | undefined {
  if (!appKey) return undefined;
  return metadataCache.get(appKey.toLowerCase());
}

export function llmProviderIconSrc(provider?: string | null): string | null {
  if (!provider) return null;
  return LOCAL_PROVIDER_ICONS[provider.toLowerCase()] ?? null;
}

export function resolveIntegrationIcon(input: {
  appKey: string;
  provider?: string;
  kind?: "model" | "integration";
}): IntegrationIconRef {
  const key = input.appKey.toLowerCase();
  if (input.kind === "model") {
    const local =
      llmProviderIconSrc(input.provider) ?? llmProviderIconSrc(key) ?? LOCAL_PROVIDER_ICONS.openai;
    return { kind: "local", value: local };
  }
  const local = LOCAL_PROVIDER_ICONS[key];
  if (local) return { kind: "local", value: local };
  const cached = metadataCache.get(key);
  if (cached) return { kind: "remote", value: cached };
  return { kind: "lucide", value: "Plug" };
}

export function integrationIconUrl(icon: IntegrationIconRef | undefined): string | null {
  if (!icon) return null;
  if (icon.kind === "local" || icon.kind === "remote") return icon.value;
  return null;
}
