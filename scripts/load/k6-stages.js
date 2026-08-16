/**
 * Progressive staged load against a cheap health endpoint (staging/local only).
 *
 *   TARGET_URL=http://127.0.0.1:8000 k6 run scripts/load/k6-stages.js
 */

import http from "k6/http";
import { check, sleep } from "k6";

const targetUrl = (__ENV.TARGET_URL || "").replace(/\/$/, "");
const smokePath = __ENV.SMOKE_PATH || "/health";
const allowProduction =
  __ENV.ALLOW_PRODUCTION_LOAD_TEST === "true" ||
  __ENV.ALLOW_PRODUCTION_LOAD === "1";

if (!targetUrl) {
  throw new Error("TARGET_URL is required");
}

const lower = targetUrl.toLowerCase();
if (
  (lower.includes("stack32.com") ||
    lower.includes("732339494633") ||
    lower.includes("production")) &&
  !allowProduction
) {
  throw new Error("Refusing production load test without ALLOW_PRODUCTION_LOAD_TEST=true");
}

export const options = {
  stages: [
    { duration: "30s", target: 25 },
    { duration: "30s", target: 50 },
    { duration: "30s", target: 100 },
    { duration: "30s", target: 250 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<3000", "p(99)<8000"],
  },
};

export default function () {
  const res = http.get(`${targetUrl}${smokePath}`);
  check(res, { "status 200": (r) => r.status === 200 });
  sleep(0.2);
}
