# Stack32

**Describe the agent you need. Build it. Use it immediately.**

Stack32 is a web SaaS that lets non-technical users create AI agents by describing them in natural language — no nodes, no workflows, no code. A Synko product by Zeldia.

> **Phase 1 status** — this repository contains the complete product foundation: full frontend UI (marketing site, auth, onboarding, agent builder), mock data layer, Supabase schema, Python agent-service scaffold and Whop billing scaffold. **No real AI, database or billing calls are made yet**: everything runs in mock mode.

## Monorepo layout

```text
stack32/
  apps/web/                 # Next.js 16 frontend (App Router, React 19, Tailwind v4)
  services/agent-service/   # Python FastAPI service (mock endpoints, SSE simulation)
  packages/
    config/                 # Shared config: company/legal info (company.ts)
    ui/                     # Placeholder for shared UI primitives (Phase 1: colocated in web)
    generated-api-types/    # Stub for OpenAPI-generated TS types
  supabase/                 # SQL migrations (RLS, pgvector), seed, config
  docs/                     # PRD, architecture notes, Supabase setup
  infra/                    # Deployment notes (Vercel / Cloud Run / Supabase)
  .github/workflows/        # CI: lint + typecheck + build + pytest + ruff
```

## Quick start (mock mode — no external services needed)

Prerequisites: Node 22+, **pnpm 10+** (this is a pnpm monorepo — `npm run dev` will not work), Python 3.12+ (only for the agent service).

```bash
pnpm install
pnpm clean          # optional: clear the Next.js cache if the machine feels stuck
pnpm dev            # → http://localhost:3000  (webpack, lighter on RAM)
```

> **Mac 8 GB / machine feels frozen?** The first Turbopack compile was indexing the whole monorepo and ballooned `.next` to ~800 MB, which thrashes an 8 GB Mac Mini. Dev now defaults to **webpack** with a 2 GB Node memory cap. If you ever need Turbopack again: `pnpm dev:web:turbo`. If it freezes again, run `pnpm clean` then `pnpm dev`.

That's it. Mock mode is the default (`NEXT_PUBLIC_USE_MOCK_DATA=true`): authentication, agents, builds and agent replies are simulated locally (localStorage), so you can navigate the entire product end to end:

1. Landing page → type a prompt in the hero composer
2. Sign up (any email/password works in mock mode)
3. Onboarding (3 steps)
4. Your prompt automatically builds a first mock agent (Build view)
5. Try the agent in **Live**, inspect it in **Structure**, create more agents

Tip: include the word `fail` in a Build prompt to see the error + auto-repair flow, or `warn` for the warning state.

### Python agent service (optional in Phase 1)

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
| `pnpm test` | Python tests (pytest) |

## Environment

Copy `.env.example` to `apps/web/.env.local` (and `services/agent-service/.env`). In mock mode nothing is required. To prepare a real environment:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase project
- `SUPABASE_SERVICE_ROLE_KEY` — **server-only**, never exposed to the browser
- `NEXT_PUBLIC_WHOP_PLAN_ID` / `WHOP_API_KEY` / `WHOP_WEBHOOK_SECRET` — Whop billing (Phase 7)

## Architecture notes

- **i18n** — English-first with full French support. All UI strings live in `apps/web/locales/{en,fr}/*.json` (10 namespaces). Adding a language = new folder + registration in `lib/i18n/locales.ts` + `lib/i18n/resources.ts`.
- **Repositories** — UI components never touch storage directly. They use TanStack Query hooks over repository interfaces (`lib/repositories/interfaces.ts`). Phase 1 binds mock (localStorage) implementations via `lib/repositories/factory.ts`; Supabase/API implementations swap in later without touching components.
- **Company/legal data** — centralized in `packages/config/src/company.ts` (Zeldia, SIREN 951 022 094). Fields still holding `TO_BE_COMPLETED_BEFORE_PRODUCTION` trigger a development banner on legal pages.
- **Supabase** — migrations in `supabase/migrations` create all PRD tables with UUID PKs, owner-scoped RLS and pgvector. See `docs/supabase-setup.md`.
- **State** — TanStack Query for server-state, Zustand strictly for local UI state (sidebar, dialogs).

## Phase 1 limits & next phases

See `docs/phase-2-todos.md` for the full list. Highlights:

- No real LLM / LangGraph — builds and replies are simulated
- Auth is mocked (Supabase Auth wiring is Phase 2)
- Whop billing is a scaffold (checkout + webhooks in Phase 7)
- Knowledge ingestion, memory and testing engine come in Phases 5–6

## License

Proprietary — © Zeldia. All rights reserved.
