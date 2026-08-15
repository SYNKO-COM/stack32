/**
 * Stack32 agent-service smoke load test (k6).
 *
 * Required env:
 *   TARGET_URL       — base URL of the Agent API (e.g. https://….run.app)
 *   TEST_AUTH_TOKEN  — Bearer JWT for an authenticated smoke user (staging only)
 *
 * Optional:
 *   VUS              — virtual users (default 10)
 *   DURATION         — test duration (default 30s)
 *   SMOKE_PATH       — path under TARGET_URL (default /health — unauthenticated)
 *   AUTH_SMOKE_PATH  — authenticated path (default /v1/agents) — only hit when token set
 *
 * NEVER point TARGET_URL at production. This script refuses hostnames that look
 * like production unless ALLOW_PRODUCTION_LOAD=1 is set (operator override).
 *
 * Examples (staging):
 *   TARGET_URL=https://staging.example.run.app VUS=50 DURATION=1m k6 run scripts/load/k6-smoke.js
 *   TARGET_URL=https://staging.example.run.app TEST_AUTH_TOKEN=$JWT VUS=100 DURATION=2m k6 run scripts/load/k6-smoke.js
 */

import http from "k6/http";
import { check, sleep } from "k6";

const targetUrl = (__ENV.TARGET_URL || "").replace(/\/$/, "");
const token = __ENV.TEST_AUTH_TOKEN || "";
const vus = Number(__ENV.VUS || 10);
const duration = __ENV.DURATION || "30s";
const smokePath = __ENV.SMOKE_PATH || "/health";
const authPath = __ENV.AUTH_SMOKE_PATH || "/v1/agents";
const allowProduction = __ENV.ALLOW_PRODUCTION_LOAD === "1";

if (!targetUrl) {
  throw new Error("TARGET_URL is required (staging Agent API base URL)");
}

const lower = targetUrl.toLowerCase();
const looksProduction =
  lower.includes("production") ||
  lower.includes("/prod") ||
  lower.includes("-prod.") ||
  lower.includes("prod.");
if (looksProduction && !allowProduction) {
  throw new Error(
    "Refusing to load-test a URL that looks like production. " +
      "Use staging, or set ALLOW_PRODUCTION_LOAD=1 only with explicit operator approval."
  );
}

export const options = {
  vus,
  duration,
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<3000"],
  },
};

export default function () {
  const healthRes = http.get(`${targetUrl}${smokePath}`);
  check(healthRes, {
    "health status 200": (r) => r.status === 200,
  });

  if (token) {
    const authRes = http.get(`${targetUrl}${authPath}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    check(authRes, {
      "auth path not 5xx": (r) => r.status < 500,
    });
  }

  sleep(1);
}
