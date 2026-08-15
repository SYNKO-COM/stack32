# Load tests (k6)

Smoke / light load against **staging** Agent API. Never target production by default.

## Prerequisites

1. Install [k6](https://k6.io/docs/get-started/installation/).
2. A reachable **staging** `TARGET_URL` (Cloud Run or tunnel).
3. Optional: a short-lived staging JWT as `TEST_AUTH_TOKEN` for authenticated paths.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `TARGET_URL` | yes | Agent API base URL (no trailing slash) |
| `TEST_AUTH_TOKEN` | no | Bearer JWT for authenticated smoke |
| `VUS` | no | Virtual users (default `10`) |
| `DURATION` | no | e.g. `30s`, `1m`, `2m` (default `30s`) |
| `SMOKE_PATH` | no | Unauthenticated path (default `/health`) |
| `AUTH_SMOKE_PATH` | no | Authenticated path (default `/v1/agents`) |
| `ALLOW_PRODUCTION_LOAD` | no | Must be `1` to override the production-URL guard |

## Staging profiles

From the repo root:

```bash
# 50 VUs
TARGET_URL="https://YOUR-STAGING-AGENT.run.app" \
  VUS=50 DURATION=1m \
  k6 run scripts/load/k6-smoke.js

# 100 VUs (+ auth)
TARGET_URL="https://YOUR-STAGING-AGENT.run.app" \
  TEST_AUTH_TOKEN="$STAGING_JWT" \
  VUS=100 DURATION=2m \
  k6 run scripts/load/k6-smoke.js

# 500 VUs (short burst — watch Cloud Run max instances / quotas first)
TARGET_URL="https://YOUR-STAGING-AGENT.run.app" \
  VUS=500 DURATION=1m \
  k6 run scripts/load/k6-smoke.js
```

## Safety

- The script **refuses** URLs that look like production (`production`, `-prod.`, etc.) unless `ALLOW_PRODUCTION_LOAD=1`.
- Do **not** automate this against production in CI.
- Prefer staging secrets and a dedicated smoke user; revoke JWTs after the run.
