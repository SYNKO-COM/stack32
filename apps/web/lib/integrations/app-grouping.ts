import type { ToolBinding } from "@/lib/domain/types";

/** Stable app key used for grouping integration nodes in the Structure canvas. */
export type AppKey = string;

export interface GroupedAppTools {
  appKey: AppKey;
  appName: string;
  provider: string;
  toolIds: string[];
  bindings: ToolBinding[];
}

/** Suite-level ids must never become a Structure node — each product app stays independent. */
export const SUITE_APP_IDS = new Set([
  "google",
  "microsoft",
  "microsoft_365",
  "microsoft365",
  "office",
  "office365",
  "ms",
  "ms365",
]);

/** Provider-level ids must not collapse distinct apps into one Structure node. */
export const GENERIC_PROVIDER_APP_IDS = new Set([
  "pipedream",
  "pd",
  "composio",
  "zapier",
  "make",
  "n8n",
]);

const NATIVE_APP_PREFIXES: Array<{ prefix: string; appKey: AppKey; appName: string; provider: string }> = [
  // Google product apps connect via Pipedream (per-app accounts).
  { prefix: "gmail_", appKey: "gmail", appName: "Gmail", provider: "pipedream" },
  { prefix: "gmail", appKey: "gmail", appName: "Gmail", provider: "pipedream" },
  { prefix: "calendar_", appKey: "google_calendar", appName: "Google Calendar", provider: "pipedream" },
  { prefix: "google_docs", appKey: "google_docs", appName: "Google Docs", provider: "pipedream" },
  { prefix: "google-docs", appKey: "google_docs", appName: "Google Docs", provider: "pipedream" },
  { prefix: "google_sheets", appKey: "google_sheets", appName: "Google Sheets", provider: "pipedream" },
  { prefix: "google-sheets", appKey: "google_sheets", appName: "Google Sheets", provider: "pipedream" },
  { prefix: "google_drive", appKey: "google_drive", appName: "Google Drive", provider: "pipedream" },
  { prefix: "google-drive", appKey: "google_drive", appName: "Google Drive", provider: "pipedream" },
  { prefix: "google_slides", appKey: "google_slides", appName: "Google Slides", provider: "pipedream" },
  { prefix: "microsoft_outlook", appKey: "microsoft_outlook", appName: "Outlook", provider: "microsoft" },
  { prefix: "outlook", appKey: "microsoft_outlook", appName: "Outlook", provider: "microsoft" },
];

const APP_DISPLAY_NAMES: Record<string, string> = {
  gmail: "Gmail",
  google_calendar: "Google Calendar",
  google_docs: "Google Docs",
  google_sheets: "Google Sheets",
  google_drive: "Google Drive",
  google_slides: "Google Slides",
  microsoft_outlook: "Outlook",
  outlook: "Outlook",
  microsoft_teams: "Microsoft Teams",
  onedrive: "OneDrive",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  pipedrive: "Pipedrive",
  slack: "Slack",
  slack_v2: "Slack",
  canva: "Canva",
  canvas: "Canvas",
  gocanvas: "GoCanvas",
  notion: "Notion",
  stripe: "Stripe",
};

/** Internal helpers — hidden from product Structure canvas. */
export const HIDDEN_STRUCTURE_TOOL_IDS = new Set([
  "current_datetime",
  "structured_output",
  "calculator",
  "fetch_url",
  "web_search",
  "knowledge_search",
  "http_request",
]);

export function isProductFacingTool(toolId: string | undefined): boolean {
  if (!toolId) return false;
  return !HIDDEN_STRUCTURE_TOOL_IDS.has(toolId);
}

function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function matchNativeApp(toolId: string): (typeof NATIVE_APP_PREFIXES)[number] | undefined {
  const id = toolId.toLowerCase().replace(/^pd:/i, "").replace(/^pipedream:/i, "");
  for (const row of NATIVE_APP_PREFIXES) {
    if (id === row.prefix.replace(/_$/, "") || id.startsWith(row.prefix)) {
      return row;
    }
  }
  return undefined;
}

/** Resolve a stable app key from tool id + optional binding metadata. */
export function resolveAppKey(
  toolId: string,
  binding?: Pick<ToolBinding, "appId" | "provider">,
): AppKey {
  const native = matchNativeApp(toolId);
  if (native) return native.appKey;

  const bindingApp = binding?.appId?.toLowerCase();
  if (
    bindingApp &&
    !SUITE_APP_IDS.has(bindingApp) &&
    !GENERIC_PROVIDER_APP_IDS.has(bindingApp)
  ) {
    return bindingApp;
  }

  const id = toolId.toLowerCase();
  if (id.startsWith("pd:") || id.startsWith("pipedream:")) {
    const slug = id.replace(/^pd:/i, "").replace(/^pipedream:/i, "").split("-")[0];
    if (slug && !SUITE_APP_IDS.has(slug) && !GENERIC_PROVIDER_APP_IDS.has(slug)) {
      return slug;
    }
  }
  return id;
}

export function resolveAppDisplayName(appKey: AppKey, toolId?: string): string {
  const key = appKey.toLowerCase();
  if (APP_DISPLAY_NAMES[key]) return APP_DISPLAY_NAMES[key];
  for (const row of NATIVE_APP_PREFIXES) {
    if (row.appKey === key) return row.appName;
  }
  if (toolId) {
    for (const row of NATIVE_APP_PREFIXES) {
      if (toolId.toLowerCase().startsWith(row.prefix)) return row.appName;
    }
  }
  return titleCaseSlug(key);
}

export function resolveAppProvider(
  appKey: AppKey,
  toolId: string,
  binding?: Pick<ToolBinding, "provider">,
): string {
  const native = matchNativeApp(toolId) ?? NATIVE_APP_PREFIXES.find((row) => row.appKey === appKey);
  if (native) return native.provider;
  if (binding?.provider && binding.provider !== "native") return binding.provider;
  if (toolId.startsWith("pd:") || toolId.startsWith("pipedream:")) return "pipedream";
  return "native";
}

/** Group product-facing tools into one entry per application. */
export function groupToolsByApp(
  toolIds: string[],
  bindings: Map<string, ToolBinding>,
): GroupedAppTools[] {
  const groups = new Map<AppKey, GroupedAppTools>();

  for (const toolId of toolIds) {
    if (!isProductFacingTool(toolId)) continue;
    const binding = bindings.get(toolId);
    const appKey = resolveAppKey(toolId, binding);
    const existing = groups.get(appKey);
    if (existing) {
      if (!existing.toolIds.includes(toolId)) existing.toolIds.push(toolId);
      if (binding && !existing.bindings.some((b) => b.toolId === binding.toolId)) {
        existing.bindings.push(binding);
      }
      continue;
    }
    groups.set(appKey, {
      appKey,
      appName: resolveAppDisplayName(appKey, toolId),
      provider: resolveAppProvider(appKey, toolId, binding),
      toolIds: [toolId],
      bindings: binding ? [binding] : [],
    });
  }

  return [...groups.values()].sort((a, b) => a.appName.localeCompare(b.appName));
}

/** Human-readable label for a tool action inside an integration drawer. */
export function toolActionLabel(toolId: string): string {
  const id = toolId.toLowerCase();
  if (id.includes("send")) return "Send";
  if (id.includes("draft") || id.includes("create_draft")) return "Draft";
  if (id.includes("read") || id.includes("get")) return "Read";
  if (id.includes("list")) return "List";
  if (id.includes("create")) return "Create";
  if (id.includes("append") || id.includes("update")) return "Update";
  const slug = id.replace(/^pd:/, "").split("-").slice(1).join(" ");
  return titleCaseSlug(slug || toolId);
}
