-- Stack32 Phase 3 — AgentSpec V2 support, GraphSpec, memories, deployments,
-- audit logs, run queue, embedding dimension, Phase 4 placeholders.
-- Forward-only. Never reset the remote database.

-- ---------------------------------------------------------------------------
-- agent_versions: optional graph_spec column + migration marker
-- ---------------------------------------------------------------------------
alter table public.agent_versions
  add column if not exists graph_spec jsonb,
  add column if not exists schema_compat text not null default 'v1'
    check (schema_compat in ('v1', 'v2', 'needs_migration'));

comment on column public.agent_versions.graph_spec is
  'Typed GraphSpec JSON (Phase 3). Null for legacy V1 versions.';
comment on column public.agent_versions.schema_compat is
  'v1=legacy skeleton, v2=AgentSpec 2.0, needs_migration=unreadable legacy';

-- Soft-mark existing rows (do not rewrite specs).
update public.agent_versions
set schema_compat = case
  when (spec ? 'schema_version') and (spec->>'schema_version') like '2%' then 'v2'
  when (spec ? 'schemaVersion') and (spec->>'schemaVersion') like '2%' then 'v2'
  else 'v1'
end
where schema_compat = 'v1';

-- ---------------------------------------------------------------------------
-- Fix embedding dimension to 1536 (text-embedding-3-small).
-- Phase 2 never wrote embeddings — safe to drop/recreate the column.
-- ---------------------------------------------------------------------------
alter table public.knowledge_chunks drop column if exists embedding;
alter table public.knowledge_chunks
  add column embedding extensions.vector(1536),
  add column if not exists embedding_model text,
  add column if not exists embedding_dimension integer;

-- ---------------------------------------------------------------------------
-- agent_memories
-- ---------------------------------------------------------------------------
create table if not exists public.agent_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  thread_id uuid,
  namespace text not null default 'default',
  memory_type text not null check (
    memory_type in ('preference', 'fact', 'instruction', 'summary', 'task_result')
  ),
  content text not null check (length(trim(content)) > 0 and length(content) <= 8000),
  summary text,
  importance numeric not null default 0.5 check (importance >= 0 and importance <= 1),
  embedding extensions.vector(1536),
  embedding_model text,
  embedding_dimension integer,
  metadata jsonb not null default '{}',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_memories_user_agent_idx
  on public.agent_memories (user_id, agent_id);
create index if not exists agent_memories_agent_type_idx
  on public.agent_memories (agent_id, memory_type);
create index if not exists agent_memories_expires_at_idx
  on public.agent_memories (expires_at)
  where expires_at is not null;

create trigger set_agent_memories_updated_at
  before update on public.agent_memories
  for each row execute function public.set_updated_at();

alter table public.agent_memories enable row level security;

create policy "agent_memories_select_owned"
  on public.agent_memories for select
  to authenticated
  using ((select auth.uid()) = user_id and private.owns_agent(agent_id));

create policy "agent_memories_delete_owned"
  on public.agent_memories for delete
  to authenticated
  using ((select auth.uid()) = user_id and private.owns_agent(agent_id));

-- Clients cannot insert/update memories directly (server / agent-service only).
revoke insert, update on public.agent_memories from authenticated, anon;

-- ---------------------------------------------------------------------------
-- agent_deployments
-- ---------------------------------------------------------------------------
create table if not exists public.agent_deployments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  agent_version_id uuid not null references public.agent_versions (id) on delete restrict,
  environment text not null default 'production'
    check (environment in ('staging', 'production')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'failed', 'disabled')),
  public_slug text,
  runtime_config jsonb not null default '{}',
  published_at timestamptz,
  unpublished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists agent_deployments_active_unique
  on public.agent_deployments (agent_id, environment)
  where status = 'active';

create index if not exists agent_deployments_user_id_idx
  on public.agent_deployments (user_id);

create trigger set_agent_deployments_updated_at
  before update on public.agent_deployments
  for each row execute function public.set_updated_at();

alter table public.agent_deployments enable row level security;

create policy "agent_deployments_select_owned"
  on public.agent_deployments for select
  to authenticated
  using ((select auth.uid()) = user_id and private.owns_agent(agent_id));

revoke insert, update, delete on public.agent_deployments from authenticated, anon;

-- ---------------------------------------------------------------------------
-- security_audit_events (service-role writes only)
-- ---------------------------------------------------------------------------
create table if not exists public.security_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  agent_id uuid references public.agents (id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  result text not null check (result in ('success', 'failure', 'denied')),
  risk_level text not null default 'low'
    check (risk_level in ('low', 'medium', 'high', 'critical')),
  ip_hash text,
  request_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists security_audit_events_user_created_idx
  on public.security_audit_events (user_id, created_at desc);
create index if not exists security_audit_events_action_idx
  on public.security_audit_events (action);

alter table public.security_audit_events enable row level security;
-- No policies for authenticated/anon → service role only.
revoke all on public.security_audit_events from authenticated, anon;

-- ---------------------------------------------------------------------------
-- run_queue — local/prod fallback when Cloud Tasks is not configured
-- ---------------------------------------------------------------------------
create table if not exists public.run_queue (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'leased', 'completed', 'failed', 'dead')),
  attempts integer not null default 0,
  lease_owner text,
  lease_expires_at timestamptz,
  available_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id)
);

create index if not exists run_queue_poll_idx
  on public.run_queue (status, available_at)
  where status in ('pending', 'leased');

create trigger set_run_queue_updated_at
  before update on public.run_queue
  for each row execute function public.set_updated_at();

alter table public.run_queue enable row level security;
revoke all on public.run_queue from authenticated, anon;

-- ---------------------------------------------------------------------------
-- rate_limit_buckets — atomic quota counters
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limit_buckets (
  bucket_key text primary key,
  window_start timestamptz not null,
  count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from authenticated, anon;

create or replace function public.consume_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count integer;
begin
  if p_limit < 1 then
    return false;
  end if;

  insert into public.rate_limit_buckets (bucket_key, window_start, count)
  values (p_bucket_key, v_now, 1)
  on conflict (bucket_key) do update
    set
      window_start = case
        when public.rate_limit_buckets.window_start
          <= v_now - make_interval(secs => p_window_seconds)
        then v_now
        else public.rate_limit_buckets.window_start
      end,
      count = case
        when public.rate_limit_buckets.window_start
          <= v_now - make_interval(secs => p_window_seconds)
        then 1
        else public.rate_limit_buckets.count + 1
      end,
      updated_at = v_now
  returning window_start, count into v_window_start, v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- monthly usage budget helper
-- ---------------------------------------------------------------------------
create or replace function public.user_monthly_usage_usd(p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
    coalesce(
      nullif(metadata->>'cost_usd', '')::numeric,
      estimated_cost,
      0
    )
  ), 0)
  from public.usage_events
  where user_id = p_user_id
    and created_at >= date_trunc('month', now() at time zone 'utc');
$$;

revoke all on function public.user_monthly_usage_usd(uuid)
  from public, anon, authenticated;
grant execute on function public.user_monthly_usage_usd(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Similarity search RPCs (RLS-safe via auth.uid())
-- ---------------------------------------------------------------------------
create or replace function public.match_knowledge_chunks(
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
security invoker
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
  where kc.agent_id = p_agent_id
    and kc.user_id = (select auth.uid())
    and ks.status = 'ready'
    and kc.embedding is not null
    and (1 - (kc.embedding <=> p_query_embedding)) >= p_min_similarity
  order by kc.embedding <=> p_query_embedding
  limit greatest(1, least(p_match_count, 32));
$$;

create or replace function public.match_agent_memories(
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
security invoker
set search_path = public, extensions
as $$
  select
    m.id,
    m.memory_type,
    m.content,
    (1 - (m.embedding <=> p_query_embedding))::float as similarity,
    m.metadata
  from public.agent_memories m
  where m.agent_id = p_agent_id
    and m.user_id = (select auth.uid())
    and (m.expires_at is null or m.expires_at > now())
    and m.embedding is not null
    and (1 - (m.embedding <=> p_query_embedding)) >= p_min_similarity
  order by m.embedding <=> p_query_embedding
  limit greatest(1, least(p_match_count, 32));
$$;

grant execute on function public.match_knowledge_chunks(uuid, extensions.vector(1536), integer, float)
  to authenticated, service_role;
grant execute on function public.match_agent_memories(uuid, extensions.vector(1536), integer, float)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Lease a run from the queue (service role)
-- ---------------------------------------------------------------------------
create or replace function public.lease_run_queue_job(
  p_owner text,
  p_lease_seconds integer default 120
)
returns public.run_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.run_queue;
begin
  select *
  into v_row
  from public.run_queue
  where status = 'pending'
    and available_at <= now()
  order by available_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.run_queue
  set
    status = 'leased',
    lease_owner = p_owner,
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    attempts = attempts + 1,
    updated_at = now()
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.lease_run_queue_job(text, integer)
  from public, anon, authenticated;
grant execute on function public.lease_run_queue_job(text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Phase 4 placeholders (disabled; no raw credentials)
-- ---------------------------------------------------------------------------
create table if not exists public.agent_triggers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  provider text not null,
  trigger_type text not null,
  config jsonb not null default '{}',
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  cron_expression text,
  timezone text not null default 'UTC',
  config jsonb not null default '{}',
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.external_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  status text not null default 'disabled'
    check (status in ('disabled', 'pending', 'active', 'error')),
  -- Reference to secret manager / vault only — never raw OAuth tokens.
  secret_ref text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agent_triggers enable row level security;
alter table public.agent_schedules enable row level security;
alter table public.external_connections enable row level security;

create policy "agent_triggers_select_owned"
  on public.agent_triggers for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "agent_schedules_select_owned"
  on public.agent_schedules for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "external_connections_select_owned"
  on public.external_connections for select to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.agent_triggers from authenticated, anon;
revoke insert, update, delete on public.agent_schedules from authenticated, anon;
revoke insert, update, delete on public.external_connections from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Extend tool_catalog metadata for Phase 3 tools + disabled Phase 4 seeds
-- ---------------------------------------------------------------------------
alter table public.tool_catalog
  add column if not exists approval_mode text not null default 'never'
    check (approval_mode in ('never', 'always', 'conditional')),
  add column if not exists timeout_seconds integer not null default 30,
  add column if not exists max_response_bytes integer not null default 200000;

update public.tool_catalog set
  input_schema = coalesce(input_schema, '{}'::jsonb),
  risk_level = 'low',
  approval_mode = 'never',
  enabled = true
where id in (
  'web_search', 'fetch_url', 'knowledge_search',
  'calculator', 'current_datetime', 'structured_output'
);

insert into public.tool_catalog (
  id, name, description, category, risk_level, enabled, approval_mode, is_internal
) values
  ('gmail', 'Gmail', 'Phase 4 — Gmail OAuth connector.', 'integration', 'high', false, 'always', false),
  ('slack', 'Slack', 'Phase 4 — Slack OAuth connector.', 'integration', 'high', false, 'always', false),
  ('notion', 'Notion', 'Phase 4 — Notion connector.', 'integration', 'high', false, 'always', false),
  ('calendar', 'Calendar', 'Phase 4 — Calendar connector.', 'integration', 'high', false, 'always', false),
  ('crm', 'CRM', 'Phase 4 — CRM connector.', 'integration', 'high', false, 'always', false),
  ('external_database', 'External database', 'Phase 4 — external SQL.', 'integration', 'high', false, 'always', false),
  ('custom_http', 'Custom HTTP', 'Phase 4 — user-defined HTTP.', 'integration', 'high', false, 'always', false),
  ('custom_code', 'Custom code', 'Phase 4 — sandboxed code.', 'integration', 'high', false, 'always', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Private schema note for LangGraph checkpoints (created by app via DATABASE_URL)
-- ---------------------------------------------------------------------------
-- agent_runtime schema is created by the agent-service checkpointer bootstrap.
-- It is intentionally NOT exposed through the Supabase PostgREST API.
