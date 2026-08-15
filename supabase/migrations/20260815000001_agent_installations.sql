-- Definition vs Installation: portable agent templates + per-user runtime installs.
-- Forward-only. Preserves legacy agent-scoped rows via nullable installation_id + backfill.

-- ---------------------------------------------------------------------------
-- agents.status: add `built` (definition successfully built; runtime setup separate)
-- ---------------------------------------------------------------------------
alter table public.agents drop constraint if exists agents_status_check;
alter table public.agents
  add constraint agents_status_check check (
    status in (
      'draft',
      'building',
      'waiting_for_input',
      'needs_setup',
      'built',
      'ready',
      'needs_attention',
      'published',
      'archived'
    )
  );

-- ---------------------------------------------------------------------------
-- agent_installations — one runtime install per (user, definition) for MVP
-- ---------------------------------------------------------------------------
create table if not exists public.agent_installations (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  pinned_version_id uuid references public.agent_versions (id) on delete set null,
  status text not null default 'setup_required'
    check (status in ('setup_required', 'ready', 'needs_attention')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, agent_id)
);

comment on table public.agent_installations is
  'Per-user runtime installation of an agent definition. Secrets, bindings, memory, schedules, and runs belong here.';

create index if not exists agent_installations_agent_idx
  on public.agent_installations (agent_id);
create index if not exists agent_installations_user_idx
  on public.agent_installations (user_id);
create index if not exists agent_installations_status_idx
  on public.agent_installations (status);

create trigger set_agent_installations_updated_at
  before update on public.agent_installations
  for each row execute function public.set_updated_at();

create or replace function private.owns_installation(installation_uuid uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.agent_installations i
    where i.id = installation_uuid
      and i.user_id = (select auth.uid())
  );
$$;

revoke all on function private.owns_installation(uuid) from public, anon;
grant execute on function private.owns_installation(uuid) to authenticated, service_role;

alter table public.agent_installations enable row level security;

create policy agent_installations_select_own on public.agent_installations
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy agent_installations_insert_own on public.agent_installations
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      private.owns_agent(agent_id)
      or exists (
        select 1 from public.agents a
        where a.id = agent_id
          and a.status = 'published'
          and a.deleted_at is null
      )
    )
  );

create policy agent_installations_update_own on public.agent_installations
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No client DELETE: soft lifecycle / service-role cleanup.
revoke delete on public.agent_installations from authenticated, anon;
grant select, insert, update on public.agent_installations to authenticated;
grant all on public.agent_installations to service_role;

-- ---------------------------------------------------------------------------
-- Add nullable installation_id to runtime-scoped tables
-- ---------------------------------------------------------------------------
alter table public.agent_connection_bindings
  add column if not exists installation_id uuid
    references public.agent_installations (id) on delete cascade;

alter table public.agent_tool_configurations
  add column if not exists installation_id uuid
    references public.agent_installations (id) on delete cascade;

alter table public.user_secrets
  add column if not exists installation_id uuid
    references public.agent_installations (id) on delete cascade;

alter table public.external_memory_configs
  add column if not exists installation_id uuid
    references public.agent_installations (id) on delete cascade;

alter table public.llm_validations
  add column if not exists installation_id uuid
    references public.agent_installations (id) on delete cascade;

alter table public.agent_schedules
  add column if not exists installation_id uuid
    references public.agent_installations (id) on delete cascade;

alter table public.agent_memories
  add column if not exists installation_id uuid
    references public.agent_installations (id) on delete cascade;

alter table public.conversation_summaries
  add column if not exists installation_id uuid
    references public.agent_installations (id) on delete cascade;

alter table public.live_threads
  add column if not exists installation_id uuid
    references public.agent_installations (id) on delete cascade;

alter table public.live_messages
  add column if not exists installation_id uuid
    references public.agent_installations (id) on delete cascade;

alter table public.runs
  add column if not exists installation_id uuid
    references public.agent_installations (id) on delete set null;

alter table public.run_events
  add column if not exists installation_id uuid
    references public.agent_installations (id) on delete set null;

alter table public.agent_approval_requests
  add column if not exists installation_id uuid
    references public.agent_installations (id) on delete cascade;

alter table public.oauth_connection_states
  add column if not exists installation_id uuid
    references public.agent_installations (id) on delete set null;

-- Indexes
create index if not exists agent_bindings_installation_idx
  on public.agent_connection_bindings (installation_id)
  where installation_id is not null;
create index if not exists agent_tool_configurations_installation_idx
  on public.agent_tool_configurations (installation_id)
  where installation_id is not null;
create index if not exists user_secrets_installation_idx
  on public.user_secrets (installation_id)
  where installation_id is not null;
create index if not exists external_memory_configs_installation_idx
  on public.external_memory_configs (installation_id)
  where installation_id is not null;
create index if not exists llm_validations_installation_idx
  on public.llm_validations (installation_id)
  where installation_id is not null;
create index if not exists agent_schedules_installation_idx
  on public.agent_schedules (installation_id)
  where installation_id is not null;
create index if not exists agent_memories_installation_idx
  on public.agent_memories (installation_id)
  where installation_id is not null;
create index if not exists live_threads_installation_idx
  on public.live_threads (installation_id)
  where installation_id is not null;
create index if not exists runs_installation_idx
  on public.runs (installation_id)
  where installation_id is not null;

-- Unique scopes for installation-aware rows (partial; legacy agent-only rows remain valid)
create unique index if not exists agent_bindings_installation_connection_unique
  on public.agent_connection_bindings (installation_id, connection_id)
  where installation_id is not null;

create unique index if not exists agent_tool_configurations_installation_tool_unique
  on public.agent_tool_configurations (installation_id, tool_id)
  where installation_id is not null;

create unique index if not exists user_secrets_installation_provider_unique
  on public.user_secrets (user_id, installation_id, provider, secret_kind)
  where installation_id is not null;

create unique index if not exists external_memory_configs_installation_unique
  on public.external_memory_configs (installation_id)
  where installation_id is not null;

create unique index if not exists llm_validations_installation_scope_unique
  on public.llm_validations (user_id, installation_id, provider, model_id)
  where installation_id is not null;

-- ---------------------------------------------------------------------------
-- Backfill: one owner installation per existing agent definition
-- ---------------------------------------------------------------------------
insert into public.agent_installations (agent_id, user_id, status, pinned_version_id)
select
  a.id,
  a.user_id,
  case
    when a.status in ('ready', 'published') then 'ready'
    when a.status = 'needs_attention' then 'needs_attention'
    else 'setup_required'
  end,
  coalesce(a.published_version_id, a.draft_version_id)
from public.agents a
where a.deleted_at is null
on conflict (user_id, agent_id) do nothing;

-- Attach legacy runtime rows to owner installations
update public.agent_connection_bindings b
set installation_id = i.id
from public.agent_installations i
where b.installation_id is null
  and b.agent_id = i.agent_id
  and b.user_id = i.user_id;

update public.agent_tool_configurations t
set installation_id = i.id
from public.agent_installations i
where t.installation_id is null
  and t.agent_id = i.agent_id
  and t.user_id = i.user_id;

update public.user_secrets s
set installation_id = i.id
from public.agent_installations i
where s.installation_id is null
  and s.agent_id is not null
  and s.agent_id = i.agent_id
  and s.user_id = i.user_id;

update public.external_memory_configs e
set installation_id = i.id
from public.agent_installations i
where e.installation_id is null
  and e.agent_id = i.agent_id
  and e.user_id = i.user_id;

update public.llm_validations v
set installation_id = i.id
from public.agent_installations i
where v.installation_id is null
  and v.agent_id is not null
  and v.agent_id = i.agent_id
  and v.user_id = i.user_id;

update public.agent_schedules s
set installation_id = i.id
from public.agent_installations i
where s.installation_id is null
  and s.agent_id = i.agent_id
  and s.user_id = i.user_id;

update public.agent_memories m
set installation_id = i.id
from public.agent_installations i
where m.installation_id is null
  and m.agent_id = i.agent_id
  and m.user_id = i.user_id;

update public.conversation_summaries c
set installation_id = i.id
from public.agent_installations i
where c.installation_id is null
  and c.agent_id = i.agent_id
  and c.user_id = i.user_id;

update public.live_threads t
set installation_id = i.id
from public.agent_installations i
where t.installation_id is null
  and t.agent_id = i.agent_id
  and t.user_id = i.user_id;

update public.live_messages m
set installation_id = i.id
from public.agent_installations i
where m.installation_id is null
  and m.agent_id = i.agent_id
  and m.user_id = i.user_id;

update public.runs r
set installation_id = i.id
from public.agent_installations i
where r.installation_id is null
  and r.agent_id = i.agent_id
  and r.user_id = i.user_id;

update public.run_events e
set installation_id = r.installation_id
from public.runs r
where e.installation_id is null
  and e.run_id = r.id
  and r.installation_id is not null;

update public.agent_approval_requests a
set installation_id = i.id
from public.agent_installations i
where a.installation_id is null
  and a.agent_id = i.agent_id
  and a.user_id = i.user_id;

-- Map definition status: needs_setup → built (runtime setup lives on installation).
update public.agents a
set status = 'built'
where a.deleted_at is null
  and a.status = 'needs_setup';

-- ---------------------------------------------------------------------------
-- RLS: runtime rows must allow installation owners who are not definition owners
-- (future published-agent consumers). Owner path remains via owns_agent.
-- ---------------------------------------------------------------------------
drop policy if exists "live_threads_select_own" on public.live_threads;
create policy "live_threads_select_own"
  on public.live_threads for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (
      private.owns_agent(agent_id)
      or (installation_id is not null and private.owns_installation(installation_id))
    )
  );

drop policy if exists "live_threads_insert_own" on public.live_threads;
create policy "live_threads_insert_own"
  on public.live_threads for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      private.owns_agent(agent_id)
      or (installation_id is not null and private.owns_installation(installation_id))
    )
  );

drop policy if exists "agent_memories_select_owned" on public.agent_memories;
create policy "agent_memories_select_owned"
  on public.agent_memories for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (
      private.owns_agent(agent_id)
      or (installation_id is not null and private.owns_installation(installation_id))
    )
  );

drop policy if exists "agent_memories_delete_owned" on public.agent_memories;
create policy "agent_memories_delete_owned"
  on public.agent_memories for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (
      private.owns_agent(agent_id)
      or (installation_id is not null and private.owns_installation(installation_id))
    )
  );

-- Published definition metadata readable by any authenticated user (no runtime secrets).
create policy agents_select_published
  on public.agents for select
  to authenticated
  using (status = 'published' and deleted_at is null);
