import type { MetadataRoute } from "next";

import { listMarketplaceAgentsAction } from "@/lib/actions/marketplace";
import { absoluteUrl, getCanonicalSiteUrl } from "@/lib/seo";

const STATIC_PATHS: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/features", changeFrequency: "monthly", priority: 0.9 },
  { path: "/pricing", changeFrequency: "weekly", priority: 0.9 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.8 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.7 },
  { path: "/legal", changeFrequency: "yearly", priority: 0.4 },
  { path: "/legal/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal/cookies", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal/sales", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal/refunds", changeFrequency: "yearly", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const base = getCanonicalSiteUrl();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((entry) => ({
    url: entry.path === "/" ? `${base}/` : absoluteUrl(entry.path),
    lastModified: now,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));

  let agentEntries: MetadataRoute.Sitemap = [];
  try {
    const agents = await listMarketplaceAgentsAction();
    agentEntries = agents.map((agent) => ({
      url: absoluteUrl(agent.publicPath),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch {
    // Marketplace RPC may be unavailable in mock / local — static routes still ship.
  }

  return [...staticEntries, ...agentEntries];
}
