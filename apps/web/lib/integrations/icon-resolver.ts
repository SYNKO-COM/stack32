import type { IntegrationIconRef } from "@/lib/domain/product-agent-graph";

const LOCAL_PROVIDER_ICONS: Record<string, string> = {
  openai: "/integrations/openai.svg",
  anthropic: "/integrations/anthropic.svg",
  google: "/integrations/google.svg",
  gmail: "/integrations/gmail.svg",
  google_calendar: "/integrations/google-calendar.svg",
  google_docs: "/integrations/google-docs.svg",
};

const metadataCache = new Map<string, string>();

export function cacheIntegrationIcon(appKey: string, imgSrc: string): void {
  if (appKey && imgSrc) metadataCache.set(appKey.toLowerCase(), imgSrc);
}

export function resolveIntegrationIcon(input: {
  appKey: string;
  provider?: string;
  kind?: "model" | "integration";
}): IntegrationIconRef {
  const key = input.appKey.toLowerCase();
  if (input.kind === "model" && input.provider) {
    const local = LOCAL_PROVIDER_ICONS[input.provider.toLowerCase()];
    if (local) return { kind: "local", value: local };
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
