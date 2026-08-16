/**
 * Stack32 agent-service smoke load test (k6).
 *
 * Required env:
 *   TARGET_URL       — base URL of the Agent API (e.g. https://….run.app)
 *
 * Optional:
 *   TEST_AUTH_TOKEN, VUS, DURATION, SMOKE_PATH, AUTH_SMOKE_PATH
 *   ALLOW_PRODUCTION_LOAD_TEST=true — required to hit production hosts
 *
 * NEVER point TARGET_URL at production without explicit override.
 */

import http from "k6/http";
import { check, sleep } from "k6";

const targetUrl = (__ENV.TARGET_URL || "").replace(/\/$/, "");
const token = __ENV.TEST_AUTH_TOKEN || "";
const vus = Number(__ENV.VUS || 10);
const duration = __ENV.DURATION || "30s";
const smokePath = __ENV.SMOKE_PATH || "/health";
const authPath = __ENV.AUTH_SMOKE_PATH || "/v1/agents";
const allowProduction =
  __ENV.ALLOW_PRODUCTION_LOAD_TEST === "true" ||
  __ENV.ALLOW_PRODUCTION_LOAD === "1";

if (!targetUrl) {
  throw new Error("TARGET_URL is required (staging Agent API base URL)");
}

const lower = targetUrl.toLowerCase();
const looksProduction =
  lower.includes("stack32.com") ||
  lower.includes("www.stack32") ||
  lower.includes("732339494633") ||
  lower.includes("production") ||
  lower.includes("/prod") ||
  lower.includes("-prod.") ||
  lower.includes("prod.");
if (looksProduction && !allowProduction) {
  throw new Error(
    "Refusing to load-test a production URL. " +
      "Use staging/localhost, or set ALLOW_PRODUCTION_LOAD_TEST=true with explicit operator approval.",
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
