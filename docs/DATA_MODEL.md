# Stack32 Data Model (Phase 2)

All tables use UUID primary keys (`gen_random_uuid()`), `created_at` (+ `updated_at` where mutable, maintained by the `public.set_updated_at()` trigger), and foreign keys to `auth.users` with `on delete cascade`. RLS is enabled on every table (see `docs/RLS_SECURITY_MODEL.md`).

Migrations live in `supabase/migrations/` (15 files, `20260804…`). Generated TypeScript types: `apps/web/lib/supabase/database.types.ts` (`pnpm supabase:types`).

## Identity & onboarding

| Table | Purpose | Notes |
| --- | --- | --- |
| `profiles` | App profile mirroring `auth.users` | Auto-created by the `handle_new_user` trigger (idempotent). `onboarding_completed` only settable through the RPC. |
| `onboarding_responses` | Current onboarding answers | One row per user (unique `user_id`); written only by `complete_onboarding`. Discovery/role values are check-constrained to the UI option ids. |
| `subscriptions` | Whop subscription state | One row per user; client read-only; written by webhook processing (Phase 7). |

## Agents

| Table | Purpose | Notes |
| --- | --- | --- |
| `agents` | User-facing agent entity | Soft delete via `deleted_at` (hidden from clients by RLS, recoverable via service role). Unique active slug per user (partial index). `draft_version_id` / `published_version_id` FK to versions. |
| `agent_versions` | Immutable AgentSpec snapshots | `spec` jsonb (Phase 2 skeleton, schema-versioned), `version_number` unique per agent, validation/test statuses, provenance (`source_prompt`, `model_*`, `created_by`). |
| `agent_tool_bindings` | Tools enabled per agent | FK to `tool_catalog`; config + approval mode. |
| `tool_catalog` | Global tool metadata | Seeded with 6 placeholder tools (no execution). Client sees only `enabled and not is_internal`. |
| `agent_tests` | Test definitions/results per version | Server-written (mock results in Phase 2). |

## Conversations

| Table | Purpose | Notes |
| --- | --- | --- |
| `builder_threads` / `builder_messages` | Build conversation | Roles `user\|assistant\|system\|tool`. Message `metadata` jsonb carries UI state (steps, tone, actions). |
| `live_threads` / `live_messages` | Live (usage) conversation | `citations` / `artifacts` jsonb; `metadata.pending/statusKey` while a mock run is in flight. Live threads are deletable by their owner ("clear conversation"). |
| `attachments` | Files linked to conversations | Must reference at least one owned context (agent/builder thread/live thread) — enforced by check constraint + RLS. |

## Execution (prepared, no real runtime yet)

| Table | Purpose | Notes |
| --- | --- | --- |
| `runs` | Build/live/test/repair/ingestion executions | Token counts, costs, statuses — server-written only (users cannot forge runs). |
| `run_events` | Append-only per-run event stream | `(run_id, sequence)` unique; ready for SSE replay/reconnection. |
| `artifacts` | Generated outputs | Server-written. |
| `usage_events` | Usage metering | Server-written; user can read own rows. |

## Knowledge (vector-ready, no embeddings yet)

| Table | Purpose | Notes |
| --- | --- | --- |
| `knowledge_sources` | File/URL/text sources per agent | Storage refs (`storage_bucket`/`storage_path`), status lifecycle. |
| `knowledge_chunks` | Future chunk store | `embedding extensions.vector` — deliberately **no dimension and no HNSW/IVFFlat index**. When the embedding model is chosen (Phase 6): `alter column embedding type vector(<dim>)` + create the index in a new migration. Client read-only. |

## Billing / integrations

| Table | Purpose | Notes |
| --- | --- | --- |
| `webhook_events` | Idempotent provider event log | Unique `(provider, provider_event_id)`. RLS enabled with **no policies** → service-role only. |

## RPCs (SECURITY DEFINER, `search_path = ''`)

| Function | Purpose |
| --- | --- |
| `complete_onboarding(...)` | Validates answers, upserts `onboarding_responses`, updates profile (first name/phone/locale), sets `onboarding_completed` atomically. |
| `create_agent_workspace(p_name, p_prompt, p_create_live_thread)` | Creates agent + version 1 (safe skeleton spec) + builder thread (+ live thread), stores the initial prompt as the first builder user message. Returns ids. |
| `soft_delete_agent(p_agent_id)` | Sets `deleted_at` on an owned active agent. |
| `private.owns_agent / owns_builder_thread / owns_live_thread / owns_run` | Ownership helpers used by RLS policies (not exposed through PostgREST). |
| `private.slugify / private.default_agent_spec` | Internal helpers. |
