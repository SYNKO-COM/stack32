import type { IntegrationAppHit } from "@/lib/actions/integrations";

const SUITE_APP_IDS = new Set([
  "google",
  "microsoft",
  "microsoft_365",
  "office_365",
  "office365",
  "google_workspace",
  "workspace",
]);

function tokens(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Prefer the exact app (Gmail) over a suite bucket (Google). */
export function rankIntegrationApps(
  query: string,
  apps: IntegrationAppHit[],
): IntegrationAppHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return apps;
  const compact = tokens(q);

  const scored = apps.map((app) => {
    const id = app.appId.toLowerCase();
    const name = app.name.toLowerCase();
    const idCompact = tokens(id);
    const nameCompact = tokens(name);
    let score = 0;
    if (id === q || idCompact === compact) score = 100;
    else if (name === q || nameCompact === compact) score = 95;
    else if (id.startsWith(q) || idCompact.startsWith(compact)) score = 80;
    else if (name.startsWith(q) || nameCompact.startsWith(compact)) score = 75;
    else if (id.includes(q) || name.includes(q) || idCompact.includes(compact)) score = 50;
    else if ((app.summary ?? "").toLowerCase().includes(q)) score = 8;

    if (SUITE_APP_IDS.has(id) && compact !== idCompact && compact !== tokens("google")) {
      score -= 60;
    }
    return { app, score };
  });

  scored.sort((a, b) => b.score - a.score || a.app.name.localeCompare(b.app.name));
  const matched = scored.filter((row) => row.score > 0).map((row) => row.app);
  return matched.length > 0 ? matched : apps;
}

/** Exact Pipedream app id only — never borrow another app's logo. */
export function pickExactAppIcon(
  appId: string,
  apps: IntegrationAppHit[],
): string | undefined {
  const id = appId.trim().toLowerCase();
  if (!id) return undefined;
  const hit = apps.find(
    (app) => app.appId.toLowerCase() === id && Boolean(app.imgSrc?.trim()),
  );
  return hit?.imgSrc?.trim();
}
