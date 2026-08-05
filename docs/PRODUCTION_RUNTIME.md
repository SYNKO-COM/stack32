# Stack32 Production Runtime

Status of the production completion plan (M0–M6) on branch `feat/production-runtime`.

## Feature flags

| Variable | Default | Meaning |
|---|---|---|
| `AGENT_RUNTIME_VERSION` | `legacy` | `langgraph` enables StateGraph tool loop |
| `QUEUE_INLINE` | `true` | Inline execute, skip enqueue. `false` = enqueue-only for workers |
| `QUEUE_WORKER_ENABLED` | `false` | Poll `lease_run_queue_job` on startup when queue mode |
| `LIVE_REQUIRE_USER_LLM_KEY` | `true` | Live requires validated BYOK |
| `AI_EXECUTION_MODE` | `mock` | `live` / `mock` / `disabled` |
| `GOOGLE_OAUTH_*` | empty | Required for Google Gmail/Calendar journeys |

## Architecture

- **Builder** = platform LLM keys; conversational identity → questions → capabilities → build → project files.
- **Generated agent (Live)** = BYOK + connection bindings only; tokens never sent to the LLM.
- **GraphSpec** remains source of truth; LangGraph is a compile target behind the runtime flag.
- **Queue** is exclusive: never enqueue and inline the same run.

## Manual Google Cloud setup

1. Create OAuth client (Web) in Google Cloud Console.
2. Authorized redirect: `GOOGLE_OAUTH_REDIRECT_URI`.
3. Enable Gmail API + Google Calendar API.
4. Set `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` on agent-service.
5. Scopes: gmail.readonly, gmail.send, gmail.compose, calendar.readonly, calendar.events, openid, email, profile.

## Migrations (forward-only)

- `20260806000001_m2_rag_memory_ownership.sql` — ownership RPCs, summaries, storage meta
- `20260807000001_m3_agent_project_files.sql` — virtual project files
- `20260808000001_m4_connections.sql` — user_connections, bindings, OAuth states, approvals
- `20260809000001_m5_queue_harden.sql` — idempotency + heartbeat

## Capability labels

See `docs/audit/M6_FINAL_REPORT.md`.
