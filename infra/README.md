# Stack32 Infrastructure

## Phase 3 status

| Resource | Status |
| --- | --- |
| Agent API Dockerfile | Ready (non-root, healthcheck) |
| Terraform staging | Scaffolded — **do not apply without billing confirmation** |
| Cloud Tasks queue | Defined in Terraform (staging + production) |
| Cloud Scheduler | Defined when `scheduler_tick_url` is set |
| Secret Manager names | Defined in Terraform |
| Local run queue | PostgreSQL `run_queue` (default `QUEUE_BACKEND=postgres`) |
| Cloud Tasks publisher | `agent_service.queue.cloud_tasks` when `QUEUE_BACKEND=cloud_tasks` |

## Local development (no GCP required)

```bash
# Terminal 1 — Supabase
pnpm supabase:start

# Terminal 2 — Agent API
cd services/agent-service
cp ../../.env.example .env   # fill SUPABASE_* + keys
# AI_EXECUTION_MODE=mock works without provider keys
# AI_EXECUTION_MODE=live requires OPENAI_API_KEY and/or XAI_API_KEY
.venv/bin/uvicorn agent_service.main:app --reload --port 8000

# Terminal 3 — Web
# apps/web/.env.local: AI_EXECUTION_MODE=agent-service
pnpm dev:web
```

Optional queue poller:

```bash
curl -X POST http://localhost:8000/v1/internal/tasks/run \
  -H "X-Internal-Token: $INTERNAL_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"run_id":"<uuid>"}'
```

## GCP checklist (operator)

1. Create a Google Cloud project and enable billing.
2. Install `gcloud` and `terraform`.
3. Authenticate: `gcloud auth login && gcloud auth application-default login`
4. Set project: `gcloud config set project YOUR_PROJECT_ID`
5. Choose region (recommended: `europe-west1`).
6. From `infra/terraform/environments/staging` (or `production`):
   - `terraform init`
   - `terraform plan -var="project_id=YOUR_PROJECT_ID"`
   - Optional scale: `-var="min_instance_count=…" -var="max_instance_count=…" -var="container_concurrency=…"`
   - Review plan; apply only when authorized.
7. Add secret versions (never commit values).
8. Build and push the agent-service image; re-apply with `image=...`.
9. Configure Cloud Tasks OIDC / target URL to `POST /v1/internal/tasks/run`.
10. Re-apply with `scheduler_tick_url=https://…/v1/internal/tasks/schedules/tick`.

## Secret Manager names (staging prefix)

- `stack32-staging-supabase-service-role-key`
- `stack32-staging-supabase-database-url`
- `stack32-staging-openai-api-key`
- `stack32-staging-xai-api-key`
- `stack32-staging-litellm-master-key`
- `stack32-staging-langfuse-secret-key`
- `stack32-staging-sentry-dsn`
- `stack32-staging-agent-service-internal-token`

Only create secrets that are actually configured.

Production secret IDs use the `stack32-production-` prefix (same suffixes).
