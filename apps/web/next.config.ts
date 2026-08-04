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

const nextConfig: NextConfig = {
  transpilePackages: ["@stack32/config", "@stack32/generated-api-types"],
  outputFileTracingRoot: monorepoRoot,
};

export default nextConfig;
