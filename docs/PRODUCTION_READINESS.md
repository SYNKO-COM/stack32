# Production readiness — integrations vertical

## Hard fail in production startup

When `ENVIRONMENT=production`, the agent-service refuses unsafe defaults:

| Check | Rule |
|---|---|
| JWT | `ALLOW_UNVERIFIED_JWT` must be false |
| Secrets | `SECRETS_ENCRYPTION_KEY` required |
| Sandbox | `SANDBOX_PROVIDER=local` forbidden |
| Checkpoints | LangGraph requires `DATABASE_URL` (no MemorySaver) |

## Publish / Live gates

- Publish calls `evaluate_agent_readiness` and rejects `needs_setup` / incomplete build.
- Live does not mark runs `completed` while LangGraph status is `interrupted`
  (connection or approval).
- Side-effect tools (`gmail_send_message`, etc.) default to dry-run until approved.

## Observability

- Security audit events on publish deny / connection flows.
- Provider health at `GET /v1/providers/health` (no secrets in response).

## Rollout recommendation

1. Ship with `AGENT_RUNTIME_VERSION=legacy` until LangGraph + Postgres soak.
2. Enable Pipedream only after Connect credentials + allowlisted origins.
3. Keep native Google journeys as the first production path.
