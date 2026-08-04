-- Stack32 Phase 2 — agent_tests, attachments, artifacts.

-- ---------------------------------------------------------------------------
-- agent_tests — automated test definitions/results per version (mock for now).
-- ---------------------------------------------------------------------------
create table public.agent_tests (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  agent_version_id uuid not null references public.agent_versions (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  input jsonb not null default '{}',
  expected jsonb,
  status text not null default 'not_run' check (
    status in ('not_run', 'running', 'passed', 'passed_with_warnings', 'failed')
  ),
  score numeric,
  report jsonb not null default '{}',
  run_id uuid references public.runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index agent_tests_agent_id_idx on public.agent_tests (agent_id);
create index agent_tests_agent_version_id_idx on public.agent_tests (agent_version_id);
create index agent_tests_run_id_idx on public.agent_tests (run_id);

create trigger set_agent_tests_updated_at
  before update on public.agent_tests
  for each row execute function public.set_updated_at();

alter table public.agent_tests enable row level security;

create policy "agent_tests_select_owned_agent"
  on public.agent_tests for select
  to authenticated
  using (private.owns_agent(agent_id));

-- Test creation/updates come from trusted server code.
revoke insert, update, delete on public.agent_tests from authenticated, anon;

-- ---------------------------------------------------------------------------
-- attachments — files uploaded in Builder/Live conversations.
-- ---------------------------------------------------------------------------
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid references public.agents (id) on delete cascade,
  builder_thread_id uuid references public.builder_threads (id) on delete cascade,
  live_thread_id uuid references public.live_threads (id) on delete cascade,
  builder_message_id uuid references public.builder_messages (id) on delete set null,
  live_message_id uuid references public.live_messages (id) on delete set null,
  storage_bucket text not null,
  storage_path text not null,
  original_name text not null,
  mime_type text,
  size_bytes bigint,
  status text not null default 'uploaded' check (
    status in ('uploading', 'uploaded', 'failed', 'deleted')
  ),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  -- An attachment must belong to at least one valid context.
  constraint attachments_context_check check (
    agent_id is not null or builder_thread_id is not null or live_thread_id is not null
  )
);

create index attachments_user_id_idx on public.attachments (user_id);
create index attachments_agent_id_idx on public.attachments (agent_id);
create index attachments_builder_thread_id_idx on public.attachments (builder_thread_id);
create index attachments_live_thread_id_idx on public.attachments (live_thread_id);
create index attachments_builder_message_id_idx on public.attachments (builder_message_id);
create index attachments_live_message_id_idx on public.attachments (live_message_id);

alter table public.attachments enable row level security;

create policy "attachments_select_own"
  on public.attachments for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Cross-user references are impossible: every referenced context must be owned.
create policy "attachments_insert_own_context"
  on public.attachments for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (agent_id is null or private.owns_agent(agent_id))
    and (builder_thread_id is null or private.owns_builder_thread(builder_thread_id))
    and (live_thread_id is null or private.owns_live_thread(live_thread_id))
  );

create policy "attachments_delete_own"
  on public.attachments for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke update on public.attachments from authenticated, anon;

-- ---------------------------------------------------------------------------
-- artifacts — generated tables/reports/files (future runtime output).
-- ---------------------------------------------------------------------------
create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  run_id uuid references public.runs (id) on delete set null,
  live_message_id uuid references public.live_messages (id) on delete set null,
  artifact_type text not null,
  title text,
  content jsonb,
  storage_bucket text,
  storage_path text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index artifacts_user_id_idx on public.artifacts (user_id);
create index artifacts_agent_id_idx on public.artifacts (agent_id);
create index artifacts_run_id_idx on public.artifacts (run_id);
create index artifacts_live_message_id_idx on public.artifacts (live_message_id);

alter table public.artifacts enable row level security;

create policy "artifacts_select_own"
  on public.artifacts for select
  to authenticated
  using ((select auth.uid()) = user_id and private.owns_agent(agent_id));

-- Artifacts are produced by trusted server code only.
revoke insert, update, delete on public.artifacts from authenticated, anon;
