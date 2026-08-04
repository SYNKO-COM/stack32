# Stack32

**Describe the agent you need. Build it. Use it immediately.**

Stack32 is a web SaaS that lets non-technical users create AI agents by describing them in natural language — no nodes, no workflows, no code. A Synko product by Zeldia.

> **Phase 2 status** — the complete Supabase backend foundation is live: real authentication (SSR cookies, Google OAuth, email confirmation, password reset), full PostgreSQL schema with strict RLS + pgTAP tests, Storage buckets, generated TypeScript types, and real persistence for profiles, onboarding, agents and conversations. AI responses are still **server-side mock simulations** (persisted to the database); the real LLM engine, knowledge ingestion and Whop billing come in later phases. Mock mode (no external services) remains fully supported. See `docs/PHASE_2_STATUS.md`.

## Monorepo layout

```text
stack32/
  apps/web/                 # Next.js 16 frontend (App Router, React 19, Tailwind v4)
  services/agent-service/   # Python FastAPI service (mock endpoints, SSE simulation)
  packages/
    config/                 # Shared config: company/legal info (company.ts)
    ui/                     # Placeholder for shared UI primitives (Phase 1: colocated in web)
    generated-api-types/    # Stub for OpenAPI-generated TS types
  supabase/                 # SQL migrations (RLS, RPCs, Storage), seed, pgTAP tests
  docs/                     # PRD, data model, RLS model, auth flows, testing
  infra/                    # Deployment notes (Vercel / Cloud Run / Supabase)
  .github/workflows/        # CI: web + db (pgTAP, types drift) + e2e + agent-service
```

## Quick start (mock mode — no external services needed)

Prerequisites: Node 22+, **pnpm 10+** (this is a pnpm monorepo — `npm run dev` will not work), Python 3.12+ (only for the agent service).

```bash
pnpm install
pnpm clean          # optional: clear the Next.js cache if the machine feels stuck
pnpm dev            # → http://localhost:3000  (webpack, lighter on RAM)
```

> **Mac 8 GB / machine feels frozen?** The first Turbopack compile was indexing the whole monorepo and ballooned `.next` to ~800 MB, which thrashes an 8 GB Mac Mini. Dev now defaults to **webpack** with a 2 GB Node memory cap. If you ever need Turbopack again: `pnpm dev:web:turbo`. If it freezes again, run `pnpm clean` then `pnpm dev`.

That's it. Mock mode is the default (`NEXT_PUBLIC_DATA_MODE=mock`): authentication, agents, builds and agent replies are simulated locally (localStorage), so you can navigate the entire product end to end:

1. Landing page → type a prompt in the hero composer
2. Sign up (any email/password works in mock mode)
3. Onboarding (3 steps)
4. Your prompt automatically builds a first mock agent (Build view)
5. Try the agent in **Live**, inspect it in **Structure**, create more agents

Tip: include the word `fail` in a Build prompt to see the error + auto-repair flow, or `warn` for the warning state.

## Supabase mode (real backend, local stack)

Prerequisite: Docker (or colima) running.

```bash
pnpm supabase:start        # local Postgres + Auth + Storage (Docker)
pnpm supabase:reset        # apply all migrations + seed
pnpm supabase:test         # pgTAP database tests
pnpm supabase:types        # regenerate apps/web/lib/supabase/database.types.ts
```

Then set in `apps/web/.env.local` (values printed by `supabase:start` / `supabase:status`):

```bash
NEXT_PUBLIC_DATA_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>   # server-only
```

`pnpm dev` now runs against the real backend: signup, onboarding, agents and conversations are persisted in Postgres with RLS. Hosted deploys: `pnpm supabase:link` then `pnpm supabase:push` (manual, after review — CI never pushes migrations).

### Python agent service

```bash
cd services/agent-service
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn agent_service.main:app --reload --port 8000   # → http://localhost:8000/docs
pytest && ruff check .
```

### All root scripts

| Command | Description |
|---|---|
| `pnpm dev` / `pnpm dev:web` | Next.js dev (webpack, port 3000) — preferred on ≤8 GB RAM |
| `pnpm dev:web:turbo` | Next.js dev with Turbopack (faster, but heavier) |
| `pnpm clean` | Delete `apps/web/.next` cache |
| `pnpm dev:all` | Web + agent-service in parallel |
| `pnpm dev:agent` | FastAPI alone (port 8000, needs venv) |
| `pnpm lint` / `pnpm typecheck` / `pnpm build` | Web quality gates |
| `pnpm test:web` | Web unit tests (Vitest) |
| `pnpm test:e2e` | Playwright E2E (requires local Supabase running) |
| `pnpm test:agent` | Python tests (pytest) |
| `pnpm supabase:start\|stop\|status\|reset\|test\|types\|lint\|link\|push` | Supabase CLI workflows |

## Environment

Copy `.env.example` to `apps/web/.env.local` (and `services/agent-service/.env`). In mock mode nothing is required. Key variables (validated at boot — Zod on web, pydantic-settings on Python):

- `NEXT_PUBLIC_DATA_MODE` — `mock` (default) or `supabase`
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY` — **server-only**, never exposed to the browser
- `AI_EXECUTION_MODE` — `mock` (persisted simulations) or `disabled`
- `BILLING_MODE` — `mock` (access granted) or `whop` (Phase 7; no silent access)
- `NEXT_PUBLIC_WHOP_PLAN_ID` / `WHOP_API_KEY` / `WHOP_WEBHOOK_SECRET` — Whop billing (Phase 7)

## Architecture notes

- **i18n** — English-first with full French support. All UI strings live in `apps/web/locales/{en,fr}/*.json` (10 namespaces). Adding a language = new folder + registration in `lib/i18n/locales.ts` + `lib/i18n/resources.ts`.
- **Repositories** — UI components never touch storage directly. They use TanStack Query hooks over repository interfaces (`lib/repositories/interfaces.ts`). Phase 1 binds mock (localStorage) implementations via `lib/repositories/factory.ts`; Supabase/API implementations swap in later without touching components.
- **Company/legal data** — centralized in `packages/config/src/company.ts` (Zeldia, SIREN 951 022 094). Fields still holding `TO_BE_COMPLETED_BEFORE_PRODUCTION` trigger a development banner on legal pages.
- **Supabase** — 15 versioned migrations create all tables with UUID PKs, deny-by-default RLS, SECURITY DEFINER RPCs, Storage buckets and pgTAP tests. See `docs/DATA_MODEL.md` and `docs/RLS_SECURITY_MODEL.md`.
- **Auth** — SSR cookies via `@supabase/ssr`, session refresh + route protection in `apps/web/middleware.ts`, translated error mapping. See `docs/AUTH_FLOWS.md`.
- **State** — TanStack Query for server-state (cache cleared on logout), Zustand strictly for local UI state (sidebar, dialogs).

## Phase 2 limits & next phases

See `docs/PHASE_2_STATUS.md` for the full delivery report. Highlights:

- No real LLM / LangGraph — builds and replies are server-side simulations persisted to the database (`AI_EXECUTION_MODE=mock`)
- Whop billing is a scaffold (checkout + webhooks in Phase 7; webhook events stored idempotently but not processed)
- Knowledge ingestion, embeddings (vector column ready, no dimension/index yet), memory and testing engine come in Phases 5–6
- agent-service verifies JWTs and reads owned data, but all execution endpoints return `501 Not Implemented`

## License

Proprietary — © Zeldia. All rights reserved.
