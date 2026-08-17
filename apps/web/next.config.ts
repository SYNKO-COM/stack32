import path from "node:path";
import type { NextConfig } from "next";

/**
 * Pin the workspace root to this monorepo.
 *
 * Without this, Next.js can pick `/Users/<you>/package-lock.json` (or any
 * lockfile above the app) as the project root and Turbopack will try to
 * index the entire home directory — which freezes an 8 GB Mac Mini.
 */
const monorepoRoot = path.join(__dirname, "../..");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Report-Only first: enforce only after verifying Next/Supabase/Whop/hCaptcha/Pipedream.
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.hcaptcha.com https://*.hcaptcha.com https://js.whop.com https://*.whop.com https://*.posthog.com https://connect.facebook.net https://analytics.tiktok.com",
      "style-src 'self' 'unsafe-inline' https://*.hcaptcha.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "worker-src 'self' blob: data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.whop.com https://*.hcaptcha.com https://*.pipedream.com https://api.pipedream.com https://*.stack32.com https://stack32.com https://*.posthog.com https://www.facebook.com https://connect.facebook.net https://*.facebook.com https://analytics.tiktok.com https://*.tiktok.com https://*.tiktokw.us",
      "frame-src 'self' https://*.hcaptcha.com https://*.whop.com https://js.whop.com",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const productionHeaders =
  process.env.VERCEL_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : [];

const nextConfig: NextConfig = {
  transpilePackages: ["@stack32/config", "@stack32/generated-api-types"],
  outputFileTracingRoot: monorepoRoot,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...securityHeaders, ...productionHeaders],
      },
    ];
  },
};

export default nextConfig;
