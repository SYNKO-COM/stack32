# Local production-like testing

Run Stack32 on localhost with **real** providers (no mock LLM, no fake Pipedream, no legacy runtime). The frontend stays on `pnpm dev`; the agent-service behaves like production.

## What “production-like” means

| Layer | Expected |
|---|---|
| Supabase | Real project (remote is fine) |
| LLM | Real API keys, `AI_EXECUTION_MODE=live` |
| Runtime | `AGENT_RUNTIME_VERSION=langgraph` + `DATABASE_URL` (Postgres checkpoints) |
| Builder sandbox | `BUILDER_SANDBOX_ENABLED=true`, `SANDBOX_PROVIDER=e2b`, real `E2B_API_KEY` |
| Pipedream | Real Connect credentials; **`PIPEDREAM_ENVIRONMENT=development` is OK** until you have Connect Production on your plan |
| Google | Real OAuth client + redirect URI |
| Queue | `QUEUE_INLINE=true` for solo local, or worker + `QUEUE_INLINE=false` |

Set `ENVIRONMENT=production-like` to enable the same startup hard-fails as production (rejects mock/legacy/local sandbox).

Copy [`.env.production-like.example`](../.env.production-like.example) into:

- `services/agent-service/.env`
- `apps/web/.env.local` (web flags only — never put Pipedream/Google secrets in `NEXT_PUBLIC_*`)

## Start commands

```bash
# Terminal 1 — agent service
cd services/agent-service
source .venv/bin/activate
uvicorn agent_service.main:app --reload --port 8000 --host 127.0.0.1

# Terminal 2 — web
cd /path/to/Stack32
pnpm dev:web

# Optional Terminal 3 — queue worker (only if QUEUE_INLINE=false)
cd services/agent-service && source .venv/bin/activate
python -m agent_service.worker
```

Apply DB migrations (including `agent_tool_configurations`):

```bash
supabase db push --linked
# or for local supabase: supabase db reset --local
pnpm supabase:types
```

## Pipedream development vs production

- Local / MVP: `PIPEDREAM_ENVIRONMENT=development`
- Later, when Connect Production is enabled on your Pipedream account:

```bash
PIPEDREAM_ENVIRONMENT=production
```

Also update allowed origins to your real app origin.

## Manual smoke (not CI)

```bash
cd /path/to/Stack32
python scripts/pipedream_smoke.py --full
```

## Slack Done checklist

1. Build: “Create an agent that can send messages to Slack.”
2. Connect Slack via the card → sync accounts → bind.
3. Configure channel if prompted.
4. Readiness = `ready`.
5. Live: ask to send a test message → approve if asked → message appears in Slack.
6. Structure canvas: Slack node runs then turns green.
