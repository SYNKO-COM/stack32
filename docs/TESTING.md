# Testing (Phase 2)

Four test layers, all runnable locally and in CI (`.github/workflows/ci.yml`).

## 1. Database — pgTAP (94 assertions)

```bash
pnpm supabase:start   # local stack must be running
pnpm supabase:test
```

Files in `supabase/tests/`:

- `001_schema_test.sql` — tables exist, RLS enabled everywhere, seed + RPCs present
- `002_profiles_trigger_test.sql` — profile auto-creation, metadata copy, idempotency, `updated_at`
- `003_rpcs_test.sql` — `complete_onboarding` validation/upsert, `create_agent_workspace` (version 1, first message, slug uniqueness), `soft_delete_agent`
- `004_rls_isolation_test.sql` — anon denial, user A vs user B isolation, assistant-role forgery, runs/usage/subscriptions forgery, privileged profile columns
- `005_storage_test.sql` — buckets, per-folder upload isolation, private listing

## 2. Web unit — Vitest (14 tests)

```bash
pnpm test:web
```

`apps/web/tests/unit/`: AgentSpec DB↔domain mappers (round-trip, skeleton, resilience), auth error → i18n mapping, env validation (mock default, legacy flag compat, publishable-key preference, fail-fast).

## 3. Web E2E — Playwright (local Supabase only)

```bash
pnpm supabase:start
pnpm test:e2e        # boots next dev on :3100 with local CLI demo keys
```

`apps/web/tests/e2e/core-journey.spec.ts`: signup → 3-step onboarding → agent workspace → builder message → mock build persisted (assistant response appears) → logout (cache cleared) → protected-route redirect → login → data still present. Plus unauthenticated redirect checks.

E2E never runs against the hosted project: the web server is launched with the local CLI's shared demo keys.

## 4. agent-service — pytest (22 tests) + ruff

```bash
pnpm test:agent      # or: cd services/agent-service && .venv/bin/pytest
```

Hermetic settings (local `.env` ignored): health/readiness, error envelope, 401 handling, HS256 verification (expired/bad signature/wrong audience), internal-token guard, production config fail-fast, NOT_IMPLEMENTED endpoints, 503 when Supabase unconfigured.

## CI jobs

| Job | Runs |
| --- | --- |
| `web` | lint, typecheck, Vitest, build (mock mode) |
| `db` | `supabase start`, db lint, pgTAP, generated-types drift check |
| `e2e` | `supabase start` + Playwright (chromium) |
| `agent-service` | ruff + pytest |

CI never pushes migrations; hosted deploys are manual (`pnpm supabase:push` after review).
