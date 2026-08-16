# Manual Vercel / GCP settings (not fully codified in repo)

## Vercel (dashboard)

- **Node.js Version**: 22.x (align with `.nvmrc` / `engines`)
- **Production**: public (stack32.com)
- **Preview Deployment Protection**: enable Standard Protection for preview URLs
- **Skew Protection**: enable if available for the project
- **Env**: `BILLING_MODE=whop`, `AI_EXECUTION_MODE=agent-service` (never mock in Production)
- **Cron** (optional): `POST /api/billing/reconcile` with `Authorization: Bearer $CRON_SECRET` every 5–15 min

## GCP / Cloud Scheduler

- Point a scheduler job at `https://stack32.com/api/billing/reconcile` with OIDC or Bearer `CRON_SECRET`
- Confirm Cloud Run ingress/IAM invoker bindings match least-privilege (documented in `infra/README.md`)
