# Phase 2+ TODOs

Phase 1 delivered the full product foundation in mock mode. Everything below is intentionally deferred. Search the codebase for `TODO(phase-` to find the exact integration points.

## Phase 2 — Real auth + data

- [ ] Wire Supabase Auth (email/password + Google OAuth) into `AuthRepository` (`apps/web/lib/repositories`), replacing `MockAuthRepository` in `factory.ts` when `NEXT_PUBLIC_USE_MOCK_DATA=false`.
- [ ] Register `updateSupabaseSession` (`lib/supabase/middleware.ts`) in a root `middleware.ts` and protect `/agents`, `/onboarding` server-side (replaces the client-side `RequireAuth`).
- [ ] Apple sign-in and magic links (UI placeholders already exist in `AuthForm`).
- [ ] Persist profiles/onboarding to Supabase (`profiles`, `onboarding_responses`).
- [ ] Supabase implementations of `AgentRepository`, `BuilderRepository`, `LiveRepository`, `KnowledgeRepository`.
- [ ] Email confirmation flow (screen exists; wire `auth/callback` states).

## Phase 3 — Agent service contract

- [ ] Generate TS types from the FastAPI OpenAPI schema into `packages/generated-api-types`.
- [ ] Verify Supabase JWTs in `agent_service/auth.py` (`verify_supabase_jwt`).
- [ ] Replace web mock builder/live calls with real `/v1` API calls + SSE streaming client.

## Phase 4 — Real builder agent

- [ ] LangGraph builder graph producing validated `AgentSpec`s (replaces `runSimulatedBuild` in `lib/repositories/mock/builder.ts`).
- [ ] Real automatic test + auto-repair loop (replaces `runSimulatedRepair`).
- [ ] Version bumps + spec diffing on modification requests.

## Phase 5 — Live runtime

- [ ] Shared runtime executing published/draft specs with tool calls (web search, fetch, calculator...).
- [ ] User-facing tool status streaming (replaces the `STATUS_SEQUENCE` simulation in `mock/live.ts`).
- [ ] Artifacts and citations from real runs.

## Phase 6 — Knowledge & memory

- [ ] File/URL ingestion pipeline → `knowledge_sources` / `knowledge_chunks` (embedding dimension to finalize, currently 1536).
- [ ] Retrieval in the runtime with citation mapping.
- [ ] Conversation summarization + profile memory.

## Phase 7 — Billing & production

- [ ] Real Whop checkout session creation (server-side, `WHOP_API_KEY`) in `BillingRepository`.
- [ ] Whop webhook verification + `webhook_events` persistence (`app/api/webhooks/whop/route.ts`).
- [ ] Plan gating (agent limits per plan) via the protected-route helper.
- [ ] Complete `packages/config/src/company.ts` placeholders (contact email, hosting provider) — the dev banner on legal pages disappears automatically.
- [ ] Legal review of all `/legal/*` drafts by a lawyer.
- [ ] Observability: Sentry, Langfuse, structured log shipping.
- [ ] Deployment: Vercel (web), Cloud Run (agent-service), hosted Supabase; secrets management.

## Known Phase 1 limitations

- Mock data lives in localStorage under `stack32.mock.*`; clearing site data resets the demo.
- The `/agents` sidebar seeds 4 example agents on first run.
- The contact form does not persist messages.
- `packages/ui` is a placeholder; shadcn primitives are colocated in `apps/web/components/ui`.
- Build prompts containing "fail"/"warn" trigger demo error/warning states (mock-only behavior).
