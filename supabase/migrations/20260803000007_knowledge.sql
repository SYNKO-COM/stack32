-- Stack32 — Knowledge base (sources + embedded chunks)
-- Sources are files/URLs/raw text attached to an agent; chunks store the
-- embedded content used for retrieval (pgvector, dimension 1536).

-- ---------------------------------------------------------------------------
-- knowledge_sources
-- ---------------------------------------------------------------------------
create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text check (kind in ('file', 'url', 'text')),
  name text,
  storage_path text, -- path in the 'agent-knowledge' storage bucket (kind = 'file')
  status text default 'pending'
    check (status in ('pending', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index knowledge_sources_agent_id_idx on public.knowledge_sources (agent_id);
create index knowledge_sources_user_id_idx on public.knowledge_sources (user_id);

create trigger set_knowledge_sources_updated_at
  before update on public.knowledge_sources
  for each row execute function public.set_updated_at();

alter table public.knowledge_sources enable row level security;

create policy "Users can view own knowledge sources"
  on public.knowledge_sources for select
  using (auth.uid() = user_id);

create policy "Users can insert own knowledge sources"
  on public.knowledge_sources for insert
  with check (auth.uid() = user_id);

create policy "Users can update own knowledge sources"
  on public.knowledge_sources for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own knowledge sources"
  on public.knowledge_sources for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- knowledge_chunks
-- ---------------------------------------------------------------------------
create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.knowledge_sources (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  embedding vector(1536), -- dimension to be finalized in Phase 6
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index knowledge_chunks_source_id_idx on public.knowledge_chunks (source_id);

-- HNSW index for cosine similarity search.
-- Works on an empty table (unlike ivfflat, which needs data to build lists).
-- Parameters (m, ef_construction) are defaults and can be tuned later once
-- real data volume and query patterns are known.
create index knowledge_chunks_embedding_idx
  on public.knowledge_chunks
  using hnsw (embedding vector_cosine_ops);

alter table public.knowledge_chunks enable row level security;

create policy "Users can view own knowledge chunks"
  on public.knowledge_chunks for select
  using (auth.uid() = user_id);

create policy "Users can insert own knowledge chunks"
  on public.knowledge_chunks for insert
  with check (auth.uid() = user_id);

create policy "Users can update own knowledge chunks"
  on public.knowledge_chunks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own knowledge chunks"
  on public.knowledge_chunks for delete
  using (auth.uid() = user_id);
