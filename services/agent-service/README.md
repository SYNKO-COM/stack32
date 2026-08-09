# Stack32 Agent Service (Phase 3)

FastAPI service that builds and runs Stack32 agents via declarative AgentSpec / GraphSpec.

## Quick start

```bash
python3 -m venv .venv
.venv/bin/pip install ../stack32-agent-runtime
.venv/bin/pip install -e ".[dev]"
cp ../../.env.example .env
# Fill SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWKS_URL, INTERNAL_SERVICE_TOKEN
# Optional for live LLM: OPENAI_API_KEY, XAI_API_KEY, AI_EXECUTION_MODE=live
# Optional integrations: GOOGLE_OAUTH_*, PIPEDREAM_*, DATABASE_URL (LangGraph checkpoints)
.venv/bin/uvicorn agent_service.main:app --reload --port 8000
```

## Auth

- User endpoints: `Authorization: Bearer <Supabase access token>` (JWKS or JWT secret).
- Internal tasks: `X-Internal-Token: <INTERNAL_SERVICE_TOKEN>` (constant-time compare).
- `ALLOW_UNVERIFIED_JWT=true` is local-only and forbidden in production.

## Key routes

- `POST /v1/agents/{id}/builder/messages`
- `POST /v1/builder/runs/{id}/identity`
- `POST /v1/live/threads/{id}/messages`
- `GET  /v1/runs/{id}/stream` (SSE)
- `POST /v1/agents/{id}/publish`
- `GET  /v1/agents/{id}/readiness`
- `POST /v1/integrations/connect-token`
- `GET  /v1/integrations/tools/search`
- `GET  /v1/providers/health`
- `POST /v1/internal/tasks/run`

## Tests

```bash
.venv/bin/ruff check .
.venv/bin/pytest
```
