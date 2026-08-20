import type { MetadataRoute } from "next";

import { getCanonicalSiteUrl } from "@/lib/seo";

/**
 * Crawl rules for search engines.
 * Marketing + public agent pages are allowed; authenticated app surfaces are blocked.
 */
export default function robots(): MetadataRoute.Robots {
  const site = getCanonicalSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/agents",
          "/agents/",
          "/api/",
          "/billing",
          "/billing/",
          "/onboarding",
          "/my-agents",
          "/settings",
          "/login",
          "/signup",
          "/forgot-password",
          "/reset-password",
          "/verify-email",
          "/auth/",
        ],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
