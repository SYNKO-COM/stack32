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
    // microphone=(self): the composer records audio for /v1/transcribe. An empty
    // allowlist blocked getUserMedia before Chrome even prompted, so the mic
    // button always failed and told users to fix their browser settings — which
    // could never help, because the block came from this header.
    value: "camera=(), microphone=(self), geolocation=(), payment=()",
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Required for Pipedream Connect popups (same-origin COOP breaks window.open).
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
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
  async redirects() {
    return [
      {
        // Structure was merged into the "Agent IA" tab. Answering this at the
        // edge keeps old links working without booting the agent workspace
        // client tree just to throw it away — rendering that tree around a
        // page whose only job is to redirect crashed with React error #310.
        source: "/agents/:agentId/structure",
        destination: "/agents/:agentId/agent",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
