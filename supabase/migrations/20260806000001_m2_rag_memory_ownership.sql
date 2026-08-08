-- Milestone 2: ownership-aware vector RPCs, conversation summaries, knowledge storage metadata

-- Replace auth.uid()-only RPCs with explicit user_id + ownership checks (service-role safe).
create or replace function public.match_knowledge_chunks(
  p_user_id uuid,
  p_agent_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 8,
  p_min_similarity float default 0.7
)
returns table (
  id uuid,
  source_id uuid,
  content text,
  similarity float,
  metadata jsonb
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    kc.id,
    kc.source_id,
    kc.content,
    (1 - (kc.embedding <=> p_query_embedding))::float as similarity,
    kc.metadata
  from public.knowledge_chunks kc
  join public.knowledge_sources ks on ks.id = kc.source_id
  join public.agents a on a.id = kc.agent_id and a.user_id = kc.user_id
  where kc.agent_id = p_agent_id
    and kc.user_id = p_user_id
    and a.user_id = p_user_id
    and ks.status = 'ready'
    and kc.embedding is not null
    and (1 - (kc.embedding <=> p_query_embedding)) >= p_min_similarity
  order by kc.embedding <=> p_query_embedding
  limit greatest(1, least(p_match_count, 32));
$$;

create or replace function public.match_agent_memories(
  p_user_id uuid,
  p_agent_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 8,
  p_min_similarity float default 0.75
)
returns table (
  id uuid,
  memory_type text,
  content text,
  similarity float,
  metadata jsonb
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    m.id,
    m.memory_type,
    m.content,
    (1 - (m.embedding <=> p_query_embedding))::float as similarity,
    m.metadata
  from public.agent_memories m
  join public.agents a on a.id = m.agent_id and a.user_id = m.user_id
  where m.agent_id = p_agent_id
    and m.user_id = p_user_id
    and a.user_id = p_user_id
    and (m.expires_at is null or m.expires_at > now())
    and m.embedding is not null
    and (1 - (m.embedding <=> p_query_embedding)) >= p_min_similarity
  order by m.embedding <=> p_query_embedding
  limit greatest(1, least(p_match_count, 32));
$$;

revoke all on function public.match_knowledge_chunks(uuid, uuid, extensions.vector(1536), integer, float) from public;
revoke all on function public.match_agent_memories(uuid, uuid, extensions.vector(1536), integer, float) from public;
grant execute on function public.match_knowledge_chunks(uuid, uuid, extensions.vector(1536), integer, float)
  to service_role;
grant execute on function public.match_agent_memories(uuid, uuid, extensions.vector(1536), integer, float)
  to service_role;

-- Drop old 4-arg overloads if still present (auth.uid based).
drop function if exists public.match_knowledge_chunks(uuid, extensions.vector(1536), integer, float);
drop function if exists public.match_agent_memories(uuid, extensions.vector(1536), integer, float);

create table if not exists public.conversation_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  thread_id uuid not null,
  summary text not null,
  source_message_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversation_summaries_thread_idx
  on public.conversation_summaries (thread_id, created_at desc);

alter table public.conversation_summaries enable row level security;

create policy conversation_summaries_select_own
  on public.conversation_summaries for select
  using (auth.uid() = user_id);

create policy conversation_summaries_no_client_write
  on public.conversation_summaries for insert
  with check (false);

-- Knowledge source storage metadata (file pipeline)
alter table public.knowledge_sources
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists content_hash text,
  add column if not exists extraction_status text,
  add column if not exists extraction_metadata jsonb not null default '{}'::jsonb;
