# Cloud Execution

## Local / default

`QUEUE_BACKEND=postgres` → `run_queue` + `POST /v1/internal/tasks/run` with `X-Internal-Token`.

Payload: `{ "run_id": "uuid" }` only.

## Production (GCP)

Cloud Tasks → OIDC → same internal endpoint on Cloud Run.

Terraform: `infra/terraform/environments/staging`.

Scale-to-zero Cloud Run is enough for on-demand published agents. Always-on listeners are Phase 4.
