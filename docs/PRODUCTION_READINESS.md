# Production readiness — integrations vertical

## Hard fail in production / production-like startup

When `ENVIRONMENT=production` or `ENVIRONMENT=production-like`, the agent-service refuses unsafe defaults:

| Check | Rule |
|---|---|
| JWT | `ALLOW_UNVERIFIED_JWT` must be false (production) |
| Secrets | `SECRETS_ENCRYPTION_KEY` required (production) |
| Sandbox | `SANDBOX_PROVIDER=local` forbidden |
| AI mode | `AI_EXECUTION_MODE=mock` forbidden |
| Runtime | `AGENT_RUNTIME_VERSION=legacy` forbidden |
| Checkpoints | LangGraph requires `DATABASE_URL` (no MemorySaver) |

See also [LOCAL_PRODUCTION_TESTING.md](./LOCAL_PRODUCTION_TESTING.md) and [`.env.production-like.example`](../.env.production-like.example).

## Integrations vertical (MVP)

| Concern | Status |
|---|---|
| Pipedream auth injection | `configured_props.<app>.authProvisionId` (server-side) |
| Account sync after Connect | `POST /v1/integrations/accounts/sync` → `user_connections` |
| Agent bindings | `POST /v1/integrations/bindings` — readiness is agent-exact |
| Tool config | `agent_tool_configurations` + Structure `ToolConfigForm` |
| Schema for LLM | Pipedream normalizer; auth/static stripped from tool schemas |
| `external_user_id` | Always JWT user id (client body ignored) |
| Structure animation | Live `runtime.*` events → module states |

## Publish / Live gates

- Publish calls `evaluate_agent_readiness` and rejects `needs_setup` / incomplete build.
- Live does not mark runs `completed` while LangGraph status is `interrupted`
  (connection or approval).
- Side-effect tools (`gmail_send_message`, Pipedream `side_effect`, etc.) require approval.

## Observability

- Security audit events on publish deny / connection flows.
- Provider health at `GET /v1/providers/health` (no secrets in response).
- Live events: `runtime.input/model/tool/connection/approval/output`.

## Rollout recommendation

1. Local: `ENVIRONMENT=production-like`, `PIPEDREAM_ENVIRONMENT=development`.
2. Keep native Google journeys as the first-party path; Pipedream for long-tail (Slack, …).
3. Switch `PIPEDREAM_ENVIRONMENT=production` only when Connect Production is enabled on the Pipedream account.
4. Manual Done: Slack send via Live (see LOCAL_PRODUCTION_TESTING.md).
