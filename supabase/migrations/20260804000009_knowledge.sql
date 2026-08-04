-- Stack32 Phase 2 — knowledge sources + chunks (vector storage preparation).
--
-- IMPORTANT: no embeddings are generated in this phase. The embedding column
-- deliberately has NO dimension and NO HNSW/IVFFlat index. When the embedding
-- model is selected (Phase 6), add a migration that:
--   1. alter table public.knowledge_chunks
--        alter column embedding type extensions.vector(<dimension>);
--   2. create index knowledge_chunks_embedding_idx on public.knowledge_chunks
--        using hnsw (embedding extensions.vector_cosine_ops);

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  source_type text not null check (source_type in ('file', 'url', 'text')),
  name text not null check (length(trim(name)) > 0),
  storage_bucket text,
  storage_path text,
  source_url text,
  status text not null default 'uploading' check (
    status in ('uploading', 'processing', 'ready', 'failed')
  ),
  error_message text,
  mime_type text,
  size_bytes bigint,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index knowledge_sources_user_id_idx on public.knowledge_sources (user_id);
create index knowledge_sources_agent_id_status_idx
  on public.knowledge_sources (agent_id, status);

create trigger set_knowledge_sources_updated_at
  before update on public.knowledge_sources
  for each row execute function public.set_updated_at();

alter table public.knowledge_sources enable row level security;

create policy "knowledge_sources_select_owned_agent"
  on public.knowledge_sources for select
  to authenticated
  using ((select auth.uid()) = user_id and private.owns_agent(agent_id));

create policy "knowledge_sources_insert_owned_agent"
  on public.knowledge_sources for insert
  to authenticated
  with check ((select auth.uid()) = user_id and private.owns_agent(agent_id));

create policy "knowledge_sources_update_owned_agent"
  on public.knowledge_sources for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "knowledge_sources_delete_owned_agent"
  on public.knowledge_sources for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- knowledge_chunks — read-only for clients; ingestion writes them in Phase 6.
-- ---------------------------------------------------------------------------
create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.knowledge_sources (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  content text not null,
  embedding extensions.vector,
  metadata jsonb not null default '{}',
  chunk_index integer not null,
  token_count integer,
  created_at timestamptz not null default now()
);

create index knowledge_chunks_source_id_idx on public.knowledge_chunks (source_id);
create index knowledge_chunks_user_id_idx on public.knowledge_chunks (user_id);
create index knowledge_chunks_agent_id_source_id_idx
  on public.knowledge_chunks (agent_id, source_id);

alter table public.knowledge_chunks enable row level security;

create policy "knowledge_chunks_select_owned_agent"
  on public.knowledge_chunks for select
  to authenticated
  using ((select auth.uid()) = user_id and private.owns_agent(agent_id));

-- Chunks are never writable from the browser.
revoke insert, update, delete on public.knowledge_chunks from authenticated, anon;
