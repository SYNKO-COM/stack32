# Cloud Execution

## Local / default

`QUEUE_BACKEND=postgres` → `run_queue` + worker poller or manual
`POST /v1/internal/tasks/run` with `X-Internal-Token`.

Payload: `{ "run_id": "uuid" }` only.

`QUEUE_INLINE=true` (dev default) executes in-process and skips enqueue.

## Production / staging (GCP)

`QUEUE_BACKEND=cloud_tasks` → `agent_service.queue.cloud_tasks` creates a Cloud Tasks
HTTP task targeting `CLOUD_TASKS_TARGET_URL` (…`/v1/internal/tasks/run`).

Auth on the task (at least one required):

- OIDC via `CLOUD_TASKS_OIDC_SERVICE_ACCOUNT` (recommended for Cloud Run)
- and/or `X-Internal-Token: $INTERNAL_SERVICE_TOKEN`

Required env: `GCP_PROJECT_ID` (or `GOOGLE_CLOUD_PROJECT`), `GCP_LOCATION`,
`CLOUD_TASKS_QUEUE`, `CLOUD_TASKS_TARGET_URL`.

Readiness (`GET /ready`) returns **503** in production / production-like when
`cloud_tasks` is selected but GCP config is incomplete. Pytest never needs Google
credentials — default backend is `postgres` and the Tasks client is imported lazily.

Optional package: `pip install 'agent-service[gcp]'` (`google-cloud-tasks`).

## Scheduler

Cloud Scheduler job (Terraform) → `POST /v1/internal/tasks/schedules/tick`
(OIDC as task invoker SA). Claims due `agent_schedules` and enqueues live runs
through the same dispatch path.

## Terraform

- Staging: `infra/terraform/environments/staging`
- Production: `infra/terraform/environments/production` (conservative min/max instances)

Scale-to-zero Cloud Run is enough for on-demand published agents. Always-on listeners are Phase 4.
