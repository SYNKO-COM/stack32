# Production setup — owner checklist

What is already wired in the repo vs what a human must still configure before going live.

## ALREADY CONFIGURED / NO ACTION

| Area | What’s in place |
| --- | --- |
| Agent API app | FastAPI service, auth (JWKS/HS256), internal token endpoints |
| Publish / Live | Definition readiness, sanitizer, deployments, installations |
| Queue (local) | `QUEUE_BACKEND=postgres` + `run_queue` + optional poller |
| Queue (GCP code) | `QUEUE_BACKEND=cloud_tasks` publisher → `POST /v1/internal/tasks/run` |
| Terraform scaffold | `infra/terraform/environments/staging` and `production` (Cloud Run, Tasks, Scheduler, secrets) |
| Dockerfile | Non-root agent-service image + healthcheck |
| Migrations | Supabase SQL under `supabase/migrations/` (apply via CLI; never `db reset` on remote) |
| Docs | `CLOUD_EXECUTION.md`, `PRODUCTION_RUNTIME.md`, `PUBLISHING_AND_RUNTIME.md` |

## ACTION REQUIRED BY OWNER

Human / billing / console steps that cannot be done from code alone.

### GCP

1. Create a Google Cloud project and **enable billing**.
2. Authenticate: `gcloud auth login && gcloud auth application-default login`.
3. Choose region (recommended: `europe-west1`).
4. From `infra/terraform/environments/staging` (then production when ready):
   - `terraform init`
   - `terraform plan -var="project_id=YOUR_PROJECT"`
   - Apply **only** with explicit approval.
5. Create **Secret Manager versions** for each `stack32-{env}-*` secret (values never in git).
6. Build/push the agent-service image; re-apply with `-var="image=..."`.
7. Grant the task invoker SA permission to invoke Cloud Run (OIDC).
8. Set runtime env: `QUEUE_BACKEND=cloud_tasks`, `GCP_PROJECT_ID`, `GCP_LOCATION`, `CLOUD_TASKS_QUEUE`, `CLOUD_TASKS_TARGET_URL`, `CLOUD_TASKS_OIDC_SERVICE_ACCOUNT`, `INTERNAL_SERVICE_TOKEN`.
9. Re-apply with `-var="scheduler_tick_url=https://…/v1/internal/tasks/schedules/tick"`.

### Supabase (hosted)

1. Create the hosted project; copy URL + service role + JWKS issuer.
2. `pnpm supabase:push` (or linked migrate) — **never** `db reset` on remote.
3. Set `DATABASE_URL` (direct Postgres) for LangGraph checkpoints.
4. Configure Auth redirect URLs for the web app origin.

### E2B

1. Create an account/key at https://e2b.dev/dashboard.
2. Production: `BUILDER_SANDBOX_ENABLED=true`, `SANDBOX_PROVIDER=e2b`, `E2B_API_KEY=…`.

### Pipedream (optional marketplace)

1. Create Connect app credentials; set `PIPEDREAM_CLIENT_ID` / `SECRET` / `PROJECT_ID`.
2. Use `PIPEDREAM_ENVIRONMENT=production` only when Connect Production is enabled on the Pipedream account.

### SMTP (scheduled-run email)

1. Provision SMTP credentials (auth user may differ from From address).
2. Set `SMTP_*`, `EMAIL_FROM_*`, `EMAIL_ENABLED=true`.

### CAPTCHA / abuse (web)

1. Choose provider (e.g. Turnstile / hCaptcha) if signup abuse is a concern.
2. Wire keys into the web app env (not yet mandatory in agent-service).

### LLM providers

1. At least one platform key for Builder (`OPENAI_API_KEY` and/or `XAI_API_KEY` recommended).
2. Fernet `SECRETS_ENCRYPTION_KEY` for BYOK at rest.
3. Live defaults to user BYOK (`LIVE_REQUIRE_USER_LLM_KEY=true`).

### Observability

1. Optional: `SENTRY_DSN` (install `agent-service[observability]`).
2. Optional: Langfuse public/secret keys.

## AUTOMATICALLY PROVISIONABLE

After project ID + billing exist, Terraform can create:

- API enablement (`run`, `artifactregistry`, `cloudtasks`, `cloudscheduler`, `secretmanager`, …)
- Artifact Registry repo
- Service accounts (`agent_api`, `task_invoker`)
- Secret Manager **secret shells** (versions still manual)
- Cloud Tasks queue
- Cloud Run service (when `image` is set)
- Cloud Scheduler job (when `scheduler_tick_url` is set)
- Scaling knobs: `min_instance_count`, `max_instance_count`, `container_concurrency`

## OPTIONAL

| Item | Notes |
| --- | --- |
| Custom domains / Cloud Armor | Operator preference |
| Always-on listeners | Out of scope — see Phase 4 boundaries |
| Load tests | `scripts/load/` against **staging only** |
| `QUEUE_WORKER_ENABLED` | Postgres poller; leave off when using Cloud Tasks |
| Google OAuth native | For first-party Gmail/Calendar journeys |
| Tavily | `WEB_SEARCH_API_KEY` for web search tool |

## Environment cheat sheet

| `ENVIRONMENT` | Typical queue | Notes |
| --- | --- | --- |
| `development` | `postgres`, `QUEUE_INLINE=true` | Local; mock AI OK |
| `test` | `postgres` | Pytest; no GCP creds required |
| `staging` | `cloud_tasks` | Real GCP; production-like flags |
| `production` | `cloud_tasks` | Strict validators; E2B; no mock |

See also `.env.example`, `docs/CLOUD_EXECUTION.md`, `docs/USER_CONFIGURATION_CHECKLIST.md`.
