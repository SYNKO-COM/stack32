# Preproduction environment

Fully isolated from production. Nothing here shares state with `stack32.com`.

| Piece | Preproduction | Production |
|---|---|---|
| Git branch | `preprod` | `main` |
| Supabase project | `fbqjuqnkemlofklrjeuo` | `mhwzxpscyvuavpfqxfgm` |
| Cloud Run service | `stack32-agent-api-preprod` | `stack32-agent-api` |
| Cloud Tasks queue | `stack32-runs-preprod` | `stack32-runs-production` |
| Vercel project | `stack32-preprod` | `stack32` |
| Domain | `pre-prod-659874458xx.stack32.com` | `stack32.com` |
| Billing | `BILLING_MODE=mock` (no real charges) | `whop` |

`ENVIRONMENT=production-like`, so every production invariant applies (E2B
sandbox required, no mock execution, JWT verification enforced) while the data
stays separate.

## What is shared on purpose

Provider credentials only — OpenAI, Anthropic, xAI, E2B, Tavily, Pipedream.
These are account-level API keys, not environment state. Note that Pipedream
Connect runs in its `production` environment for both, because the config
guard forbids `development` under production-like; connected accounts are
therefore visible to both environments.

Secrets specific to preproduction (Supabase service role, database URL,
internal service token, encryption key) are separate Secret Manager entries
prefixed `stack32-preprod-`.

## Deploying

```bash
gcloud builds submit --config=cloudbuild.preprod.yaml .
```

Same gates as production: `ruff`, `pytest` and `bandit` run before the image is
built, so a failing service never reaches preproduction either.

Frontend:

```bash
VERCEL_ORG_ID=team_C7cEqam67wmnaZG8xaO876rz \
VERCEL_PROJECT_ID=prj_Q1gLhC7rGTQwFWTDwj3lYjry68Xs \
vercel deploy --prod --yes
```

## Database migrations

```bash
supabase link --project-ref fbqjuqnkemlofklrjeuo
supabase db push --linked
```

**Re-link to production deliberately** when you are done — the CLI stays
pointed at whatever was last linked.

## Promoting to production

Merge `preprod` into `main`. The production Cloud Build trigger takes over from
there, and `infra/DEPLOY_CHECKLIST.md` covers the steps a build cannot apply.
