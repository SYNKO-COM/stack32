# Stack32 Agent Service

FastAPI backend for building and running Stack32 AI agents.

**Phase 1**: all endpoints return realistic mock data. No LLM, LangGraph, Supabase or
Whop integration yet — those land in later phases (see `TODO(phase-N)` comments).

## Requirements

- Python 3.12+

## Local development

```bash
cd services/agent-service

# Create and activate a virtualenv
python3 -m venv .venv
source .venv/bin/activate

# Install with dev dependencies
pip install -e ".[dev]"

# Run the API (http://localhost:8000, docs at /docs)
uvicorn agent_service.main:app --reload --port 8000
```

## Tests and linting

```bash
pytest
ruff check .
```

## Configuration

Settings are read from environment variables or a `.env` file:

| Variable              | Default                       | Description                        |
| --------------------- | ----------------------------- | ---------------------------------- |
| `ENVIRONMENT`         | `development`                 | Deployment environment name        |
| `CORS_ORIGINS`        | `["http://localhost:3000"]`   | Allowed CORS origins (JSON list)   |
| `SUPABASE_URL`        | *(empty)*                     | Supabase project URL (Phase 2+)    |
| `SUPABASE_JWT_SECRET` | *(empty)*                     | Supabase JWT secret (Phase 2+)     |
| `LOG_LEVEL`           | `INFO`                        | Logging level                      |

## Docker

```bash
docker build -t stack32-agent-service .
docker run -p 8000:8000 stack32-agent-service
```

## API overview

- `GET /health` — health check (no auth)
- `GET /v1/agents`, `POST /v1/agents`, `GET /v1/agents/{id}` — agent management
- `POST /v1/agents/{id}/builder/messages` — builder conversation
- `POST /v1/agents/{id}/test` / `repair` / `publish` — agent lifecycle
- `POST /v1/live/threads/{thread_id}/messages` — live end-user conversation
- `GET /v1/runs/{run_id}/stream` — run progress as Server-Sent Events

All `/v1` endpoints require an `Authorization: Bearer <token>` header. In Phase 1
any token is accepted (no verification).
