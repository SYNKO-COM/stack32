# Deploy checklist — agent-service

Cloud Build now gates itself: the `Verify` step runs `ruff check .`, `pytest`
and `bandit` before the image is built, so a failing service cannot reach
production. Pushing to `main` is the deploy.

## One-time Cloud Run changes to apply with this release

These are **not** applied by the build. Run them once, then confirm.

### 1. Mount the Sentry DSN

The secret `stack32-production-sentry-dsn` exists but was never mounted, so
`_maybe_init_sentry` returned immediately and production ran with no error
reporting. The image now installs the `observability` extra, so the DSN
finally has an SDK to initialise.

```bash
gcloud run services update stack32-agent-api --region=europe-west1 --update-secrets=SENTRY_DSN=stack32-production-sentry-dsn:latest
```

### 2. Confirm the request timeout

`cloudbuild.yaml` passes `--timeout=3600` on every deploy, so this should
already be set. Verify:

```bash
gcloud run services describe stack32-agent-api --region=europe-west1 --format='value(spec.template.spec.timeoutSeconds)'
```

### 3. Decide on min-instances (cost tradeoff — your call)

There is no `min-instances`, so the first request after idle pays a cold start
of several seconds on a FastAPI + LangGraph image. Cloud Scheduler pings
`/tick` every minute, so an instance is often warm by accident but not
reliably. `min-instances=1` removes the cold start for roughly 15–25 EUR/month.

```bash
gcloud run services update stack32-agent-api --region=europe-west1 --min-instances=1
```

## After deploying

`/ready` now returns **503** when the Pipedream runtime data is missing from
the image, so Cloud Run's readiness gate keeps a bad revision from taking
traffic. Confirm the new revision reports ready:

```bash
curl -s https://stack32-agent-api-732339494633.europe-west1.run.app/ready
```

Expected: `{"status":"ready","checks":{...,"pipedream_runtime_data":true}}`

Then verify the two flows that were broken in production:

1. Open an agent in Build and click **Publier** — must no longer return
   "Le service agent est momentanément indisponible".
2. Open the Structure trigger drawer on a Google Sheets agent — the dropdowns
   must populate instead of degrading to free-text fields.

## Database migrations

CI never pushes migrations. Apply them deliberately, after review:

```bash
pnpm supabase:link && pnpm supabase:push
```

The only schema-adjacent change in this release is a regenerated
`database.types.ts` (the committed file was 507 lines behind the migrations).
No new migration is required.
