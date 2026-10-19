/** Build with the same loopback-only configuration as the browser server. */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import config from "../../../playwright.config";
const servers = config.webServer;
if (!Array.isArray(servers)) throw new Error("Local browser servers required");
const server = servers.find(server => server.url === "http://localhost:3100");
if (!server?.env || server.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321") throw new Error("LOCAL_BUILD_ONLY");
const require = createRequire(import.meta.url);
const result = spawnSync(process.execPath, [require.resolve("next/dist/bin/next"), "build", "--webpack"], {
  stdio: "inherit",
  env: { ...process.env, ...server.env, NODE_OPTIONS: process.env.NODE_OPTIONS ?? "--max-old-space-size=3072" },
});
process.exit(result.status ?? 1);
