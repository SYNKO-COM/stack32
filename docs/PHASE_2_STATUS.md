# Phase 2 Status — Supabase Backend, Auth, Onboarding, Persistence

_Last updated: 2026-08-04_

## What Phase 2 delivered

| Area | Status | Notes |
| --- | --- | --- |
| Supabase schema (15 migrations) | ✅ Done | 20 tables, RPCs, storage buckets, realtime publication — see `docs/DATA_MODEL.md` |
| RLS (deny-by-default) | ✅ Done | 94 pgTAP assertions pass — see `docs/RLS_SECURITY_MODEL.md` |
| Hosted deployment | ✅ Done | Migrations pushed to project `mhwzxpscyvuavpfqxfgm` (Postgres 17) |
| Generated types | ✅ Done | `apps/web/lib/supabase/database.types.ts`, drift-checked in CI |
| Auth SSR (email/password, Google, reset) | ✅ Done | Middleware session refresh + route protection, `/auth/callback` + `/auth/confirm` |
| Apple OAuth | 🟡 Scaffold | Button present but disabled; provider not configured yet |
| Onboarding persistence | ✅ Done | Atomic `complete_onboarding` RPC, upsert-safe |
| Agent workspace | ✅ Done | `create_agent_workspace` RPC (agent + version 1 + threads), `soft_delete_agent` |
| Supabase repositories | ✅ Done | Auth, Agents, Builder, Live, Knowledge, Billing behind `NEXT_PUBLIC_DATA_MODE` |
| Mock AI adapters | ✅ Done | `MockBuilderExecutionAdapter` / `MockLiveExecutionAdapter` persist server-side (`AI_EXECUTION_MODE=mock`) |
| Realtime | 🟡 Prepared | Publication covers agents/messages/runs; UI currently uses short polling during active runs |
| agent-service | ✅ Done | Real JWT verification (JWKS + HS256 fallback), `/ready`, `/v1` namespaces, persistence-safe reads, 501 stubs |
| Billing scaffold | ✅ Done | `subscriptions` table, `BILLING_MODE`, idempotent `webhook_events` persistence, no invented Whop formats |
| Tests | ✅ Done | 94 pgTAP + 14 Vitest + 2 Playwright E2E + 22 pytest — all green |
| CI | ✅ Done | web, db (pgTAP + types drift), e2e, agent-service jobs |

## What is intentionally NOT in Phase 2

- No LLM calls, no LangGraph, no real agent building or execution (Phase 3+).
- No embeddings: `knowledge_chunks.embedding` is `vector` **without dimension or index** (finalized in Phase 6).
- No real Whop billing: `BILLING_MODE=mock` simulates an active plan in development; webhooks are persisted but never processed (Phase 7).
- No knowledge ingestion pipeline: sources are metadata-only placeholders.

## Key decisions

- **Data mode**: `NEXT_PUBLIC_DATA_MODE=mock|supabase` replaces `NEXT_PUBLIC_USE_MOCK_DATA` (the legacy flag is still honoured). The repository factory is the single switch point; UI components never check the mode.
- **Auth keys**: the new publishable key (`sb_publishable_…`) is preferred; the legacy anon JWT works as a fallback.
- **Assistant messages are never client-writable**: clients may only insert their own `user`-role messages (RLS-enforced). All assistant/system/tool writes go through trusted server actions using the service-role client after ownership verification.
- **AgentSpec storage**: the DB stores the Phase 2 snake_case skeleton in `agent_versions.spec` (jsonb). `lib/domain/mappers.ts` converts both directions so the approved Structure UI renders unchanged.
- **Mock execution UX**: the server adapter updates message metadata progressively; the UI polls (700 ms) only while a run is active. Realtime channels can replace polling without schema changes.
- **Avatars bucket is public-read** (documented trade-off): the current UI renders plain URLs. Uploads remain restricted to the owner's folder.

## Credentials & safety

- Secrets live only in `apps/web/.env.local` and `services/agent-service/.env` (both git-ignored). `.env.example` contains names only.
- The service-role key never reaches the browser (`server-only` guard on the admin client).
- Since the keys were shared in a chat, **rotating them in the Supabase dashboard is recommended**.
- Migration workflow: local Docker → `supabase db reset` + pgTAP → review → `supabase db push --linked`. Never `db reset` against the hosted project.

## How to run

```bash
pnpm supabase:start      # local stack (Docker/colima)
pnpm supabase:reset      # apply migrations + seed
pnpm supabase:test       # 94 pgTAP tests
pnpm dev                 # web on :3000 (uses apps/web/.env.local)
pnpm test:web            # Vitest unit tests
pnpm test:e2e            # Playwright against the LOCAL stack
pnpm test:agent          # pytest (agent-service)
```

See `docs/TESTING.md` and `docs/supabase-setup.md` for details.

## Known follow-ups for Phase 3+

- Replace polling with Realtime subscriptions in `use-builder` / `use-live`.
- Next.js 16 deprecates the `middleware.ts` convention in favour of `proxy.ts`; migrate when `@supabase/ssr` documents the new pattern.
- Configure Google (and later Apple) OAuth providers in the hosted dashboard; local scaffolding is ready.
- Wire attachments UI to the `attachments` bucket/table (schema and policies are ready).
