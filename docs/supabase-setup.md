# Supabase Setup — Stack32

This document explains how to run the Stack32 database locally with the Supabase CLI, and how to connect the web app to a hosted project.

## 1. Install the Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# or via npm (any platform)
npm install -g supabase
```

Docker Desktop (or a compatible container runtime) must be running for local development.

## 2. Start the local stack

From the repository root:

```bash
cd /path/to/Stack32
supabase start
```

This boots Postgres, Auth, Storage, and Studio locally using `supabase/config.toml` (`project_id = "stack32"`). Default local URLs:

- API: `http://127.0.0.1:54321`
- Studio: `http://127.0.0.1:54323`
- Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

`supabase start` prints the local `anon` and `service_role` keys — copy them into your env file (see below).

## 3. Apply migrations + seed

```bash
supabase db reset
```

`db reset` drops and recreates the local database, applies every migration in `supabase/migrations/` in filename order, then runs `supabase/seed.sql`.

Note about the seed: it is **dev-only** and requires at least one user in `auth.users`. On a completely fresh instance it skips gracefully with a notice. To get the example "Sales Research Agent" seeded:

1. Create a test user (Studio → Authentication → Add user, or sign up through the app).
2. Re-run the seed: `supabase db reset` again, or execute `seed.sql` against the local database.

## 4. Link a hosted project

```bash
supabase login
supabase link --project-ref <your-project-ref>

# Push all local migrations to the hosted database
supabase db push
```

The project ref is visible in the Supabase dashboard URL (`https://supabase.com/dashboard/project/<ref>`). The hosted seed is not applied by `db push` — the seed is for local dev only.

## 5. Environment variables for the web app

| Variable | Scope | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server | Supabase project URL (local: `http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server | Public anonymous key; safe to expose, protected by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Bypasses RLS entirely. Never expose it to the browser, never prefix it with `NEXT_PUBLIC_`, and only use it in server-side code (webhook handlers, background jobs). |

## 6. Storage buckets

Created by migration `20260803000009_storage.sql`:

| Bucket | Visibility | Purpose |
| --- | --- | --- |
| `avatars` | Public read | User profile pictures |
| `agent-knowledge` | Private | Files uploaded as agent knowledge sources |
| `attachments` | Private | Files attached to conversations |

All buckets use a per-user folder convention: objects must live under a `{user_id}/...` prefix. RLS policies on `storage.objects` only let an authenticated user manage files inside their own folder. Avatars are publicly readable by anyone.

## 7. Vector search (pgvector)

The `vector` extension is enabled and `knowledge_chunks.embedding` is declared as `vector(1536)` (OpenAI `text-embedding-3-small` dimension). An HNSW index with cosine distance is created on the column. Both the dimension and the index parameters are provisional and will be finalized in Phase 6 (knowledge/RAG).

## 8. Security model summary

- RLS is enabled on **every** table.
- All user-facing tables have ownership policies (`auth.uid() = user_id`).
- `subscriptions` is read-only for clients; writes come from server-side webhook handlers via the service role.
- `webhook_events` has RLS enabled with **no policies**: it is inaccessible to clients and only reachable with the service role key.
