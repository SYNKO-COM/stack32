-- Stack32 — Agents, versions and tests
-- An agent is the user-facing entity; each immutable agent_version stores the
-- full AgentSpec as jsonb. agents.draft_version_id / published_version_id
-- point at versions (FKs added after agent_versions exists, see below).

-- ---------------------------------------------------------------------------
-- agents
-- ---------------------------------------------------------------------------
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  slug text,
  status text not null default 'draft'
    check (status in ('draft', 'building', 'ready', 'needs_attention', 'published')),
  draft_version_id uuid,
  published_version_id uuid,
  icon text,
  deleted_at timestamptz, -- soft delete: filter "deleted_at is null" in queries
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index agents_user_id_idx on public.agents (user_id);

create trigger set_agents_updated_at
  before update on public.agents
  for each row execute function public.set_updated_at();

alter table public.agents enable row level security;

create policy "Users can view own agents"
  on public.agents for select
  using (auth.uid() = user_id);

create policy "Users can insert own agents"
  on public.agents for insert
  with check (auth.uid() = user_id);

create policy "Users can update own agents"
  on public.agents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own agents"
  on public.agents for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- agent_versions (immutable snapshots of the AgentSpec)
-- ---------------------------------------------------------------------------
create table public.agent_versions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  version_number int not null,
  spec jsonb not null,
  test_status text check (test_status in ('pending', 'passed', 'failed')),
  cost_usd numeric,
  created_at timestamptz not null default now(),
  unique (agent_id, version_number)
);

create index agent_versions_agent_id_idx on public.agent_versions (agent_id);
create index agent_versions_user_id_idx on public.agent_versions (user_id);

alter table public.agent_versions enable row level security;

create policy "Users can view own agent versions"
  on public.agent_versions for select
  using (auth.uid() = user_id);

create policy "Users can insert own agent versions"
  on public.agent_versions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own agent versions"
  on public.agent_versions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own agent versions"
  on public.agent_versions for delete
  using (auth.uid() = user_id);

-- Now that agent_versions exists, wire up the circular references from agents.
alter table public.agents
  add constraint agents_draft_version_id_fkey
    foreign key (draft_version_id) references public.agent_versions (id) on delete set null,
  add constraint agents_published_version_id_fkey
    foreign key (published_version_id) references public.agent_versions (id) on delete set null;

-- ---------------------------------------------------------------------------
-- agent_tests (results of automated test runs against a version)
-- ---------------------------------------------------------------------------
create table public.agent_tests (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  version_id uuid references public.agent_versions (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text check (status in ('passed', 'failed')),
  summary text,
  details jsonb default '{}',
  created_at timestamptz not null default now()
);

create index agent_tests_agent_id_idx on public.agent_tests (agent_id);
create index agent_tests_version_id_idx on public.agent_tests (version_id);

alter table public.agent_tests enable row level security;

create policy "Users can view own agent tests"
  on public.agent_tests for select
  using (auth.uid() = user_id);

create policy "Users can insert own agent tests"
  on public.agent_tests for insert
  with check (auth.uid() = user_id);

create policy "Users can update own agent tests"
  on public.agent_tests for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own agent tests"
  on public.agent_tests for delete
  using (auth.uid() = user_id);
