# Cost Controls

## Plans (pre-Whop, Whop-ready)

| Plan | Price / mo | Annual / mo | Base credits / mo | Platform budget |
| --- | --- | --- | --- | --- |
| Free | $0 | — | 25 | $1 / mo |
| Starter | $24 | $20 | 100 | $6 / mo · $72 / yr |
| Pro | $49 | $40 | 200 | $11 / mo · $132 / yr |
| Scale | $99 | $80 | 400 | $21 / mo · $252 / yr |

- Extra credits (dropdown up to 10 000) scale **price** and **budget** proportionally: `price = base × (credits / baseCredits)`.
- Annual shows monthly credits; metering uses a **yearly** pool (`credits × 12`, `budget × 12`).
- Live stays BYOK by default (`LIVE_REQUIRE_USER_LLM_KEY`).

## Runtime enforcement

- Period budget via RPC `user_period_budget_status` (agent-service).
- Credits UI via `get_my_credit_usage` (topbar progress = real `usage_events` costs).
- Token → USD: LiteLLM `response_cost`, else fallback rates in `billing/plans`.
- Credits used = `cost_usd / (budget_usd / period_credits)`.
- Workspace caps: Free/Starter = 1; Pro/Scale = unlimited (`create_workspace`).

## Legacy knobs

- `MONTHLY_USER_BUDGET_USD` — fallback only if entitlement RPC is unavailable.
- Per-user / per-IP RPM via `consume_rate_limit`
- Concurrent run caps, max repairs, cheap profiles by default
