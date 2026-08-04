-- Stack32 Phase 2 — agents + immutable agent_versions + ownership helper.

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  slug text not null check (length(trim(slug)) > 0),
  description text,
  icon_key text,
  status text not null default 'draft' check (
    status in ('draft', 'building', 'ready', 'needs_attention', 'published', 'archived')
  ),
  draft_version_id uuid,
  published_version_id uuid,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.agents is
  'User-facing agent entity. Soft-deleted via deleted_at; versions live in agent_versions.';

create index agents_user_id_idx on public.agents (user_id);
create index agents_updated_at_idx on public.agents (updated_at desc);
create index agents_status_idx on public.agents (status);
create index agents_user_id_updated_at_idx on public.agents (user_id, updated_at desc);
-- Unique active slug per user (soft-deleted agents free their slug).
create unique index agents_user_slug_active_key
  on public.agents (user_id, slug) where deleted_at is null;

create trigger set_agents_updated_at
  before update on public.agents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Ownership helper (used by all child-table policies).
-- SECURITY DEFINER avoids recursive RLS evaluation on public.agents.
-- ---------------------------------------------------------------------------
create or replace function private.owns_agent(agent_uuid uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.agents a
    where a.id = agent_uuid
      and a.user_id = (select auth.uid())
      and a.deleted_at is null
  );
$$;

revoke all on function private.owns_agent(uuid) from public, anon;
grant execute on function private.owns_agent(uuid) to authenticated, service_role;

alter table public.agents enable row level security;

create policy "agents_select_own_active"
  on public.agents for select
  to authenticated
  using ((select auth.uid()) = user_id and deleted_at is null);

create policy "agents_insert_own"
  on public.agents for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "agents_update_own"
  on public.agents for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No DELETE policy: agents are soft-deleted (deleted_at) via update/RPC.
revoke delete on public.agents from authenticated, anon;
-- Column-level privileges: the owner cannot reassign user_id.
revoke insert, update on public.agents from authenticated;
grant insert (id, user_id, name, slug, description, icon_key, status)
  on public.agents to authenticated;
grant update (name, slug, description, icon_key, status,
              draft_version_id, published_version_id, last_opened_at, deleted_at)
  on public.agents to authenticated;

-- ---------------------------------------------------------------------------
-- agent_versions — immutable AgentSpec snapshots.
-- ---------------------------------------------------------------------------
create table public.agent_versions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  spec jsonb not null,
  change_summary text,
  source_prompt text,
  validation_status text not null default 'pending' check (
    validation_status in ('pending', 'valid', 'invalid')
  ),
  test_status text not null default 'not_run' check (
    test_status in ('not_run', 'running', 'passed', 'passed_with_warnings', 'failed')
  ),
  model_provider text,
  model_name text,
  estimated_cost numeric,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint agent_versions_agent_id_version_number_key unique (agent_id, version_number)
);

comment on table public.agent_versions is
  'Immutable AgentSpec snapshots. In Phase 2 spec holds a mock skeleton; the real Builder Agent lands in Phase 3+.';

create index agent_versions_agent_id_idx on public.agent_versions (agent_id);
create index agent_versions_agent_id_version_number_idx
  on public.agent_versions (agent_id, version_number desc);
create index agent_versions_created_by_idx on public.agent_versions (created_by);

alter table public.agent_versions enable row level security;

create policy "agent_versions_select_owned_agent"
  on public.agent_versions for select
  to authenticated
  using (private.owns_agent(agent_id));

-- Insertion is allowed for owned agents (used by trusted server actions
-- running in the user context); versions are immutable for normal users.
create policy "agent_versions_insert_owned_agent"
  on public.agent_versions for insert
  to authenticated
  with check (private.owns_agent(agent_id) and created_by = (select auth.uid()));

revoke update, delete on public.agent_versions from authenticated, anon;

-- Deferred circular FKs from agents to versions.
alter table public.agents
  add constraint agents_draft_version_id_fkey
    foreign key (draft_version_id) references public.agent_versions (id) on delete set null,
  add constraint agents_published_version_id_fkey
    foreign key (published_version_id) references public.agent_versions (id) on delete set null;

create index agents_draft_version_id_idx on public.agents (draft_version_id);
create index agents_published_version_id_idx on public.agents (published_version_id);
