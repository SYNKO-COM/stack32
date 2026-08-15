-- Product workspaces: each user has one or more workspaces; agents belong to a workspace.

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.workspaces is
  'User product workspaces. Agents are scoped to a workspace.';

create index workspaces_user_id_idx on public.workspaces (user_id);
create index workspaces_user_id_updated_at_idx
  on public.workspaces (user_id, updated_at desc);

create trigger set_workspaces_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

alter table public.workspaces enable row level security;

create policy "workspaces_select_own"
  on public.workspaces for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "workspaces_insert_own"
  on public.workspaces for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "workspaces_update_own"
  on public.workspaces for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "workspaces_delete_own"
  on public.workspaces for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.workspaces from anon;
grant select, insert, update, delete on table public.workspaces to authenticated;
grant all on table public.workspaces to service_role;

-- Attach agents to workspaces.
alter table public.agents
  add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

-- Backfill: one default workspace per user that already has agents or finished onboarding.
insert into public.workspaces (user_id, name)
select distinct src.user_id, 'My workspace'
from (
  select user_id from public.agents where deleted_at is null
  union
  select id as user_id from public.profiles where onboarding_completed = true
) src
where not exists (
  select 1 from public.workspaces w where w.user_id = src.user_id
);

update public.agents a
set workspace_id = w.id
from public.workspaces w
where w.user_id = a.user_id
  and a.workspace_id is null;

-- Any remaining agents without a workspace (edge cases) get one.
do $$
declare
  r record;
  wid uuid;
begin
  for r in
    select distinct user_id from public.agents where workspace_id is null
  loop
    insert into public.workspaces (user_id, name)
    values (r.user_id, 'My workspace')
    returning id into wid;
    update public.agents set workspace_id = wid where user_id = r.user_id and workspace_id is null;
  end loop;
end $$;

alter table public.agents
  alter column workspace_id set not null;

create index agents_workspace_id_idx on public.agents (workspace_id);
create index agents_workspace_id_updated_at_idx
  on public.agents (workspace_id, updated_at desc);

-- Column grants: allow workspace_id on insert/update.
revoke insert, update on public.agents from authenticated;
grant insert (
  id, user_id, workspace_id, name, slug, description, icon_key, status
) on public.agents to authenticated;
grant update (
  name, slug, description, icon_key, status, draft_version_id, published_version_id,
  last_opened_at, deleted_at, workspace_id
) on public.agents to authenticated;

-- ---------------------------------------------------------------------------
-- create_workspace
-- ---------------------------------------------------------------------------
create or replace function public.create_workspace(p_name text)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_row public.workspaces;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  insert into public.workspaces (user_id, name)
  values (v_user_id, coalesce(nullif(trim(coalesce(p_name, '')), ''), 'My workspace'))
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- create_agent_workspace — now requires / accepts a product workspace id
-- ---------------------------------------------------------------------------
drop function if exists public.create_agent_workspace(text, text, boolean);

create or replace function public.create_agent_workspace(
  p_name text default null,
  p_prompt text default null,
  p_create_live_thread boolean default true,
  p_workspace_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_name text;
  v_base_slug text;
  v_slug text;
  v_suffix integer := 1;
  v_agent_id uuid;
  v_version_id uuid;
  v_builder_thread_id uuid;
  v_live_thread_id uuid;
  v_prompt text := nullif(trim(coalesce(p_prompt, '')), '');
  v_workspace_id uuid := p_workspace_id;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if v_workspace_id is null then
    select id into v_workspace_id
    from public.workspaces
    where user_id = v_user_id
    order by created_at asc
    limit 1;

    if v_workspace_id is null then
      insert into public.workspaces (user_id, name)
      values (v_user_id, 'My workspace')
      returning id into v_workspace_id;
    end if;
  else
    if not exists (
      select 1 from public.workspaces
      where id = v_workspace_id and user_id = v_user_id
    ) then
      raise exception 'workspace_not_found' using errcode = 'P0002';
    end if;
  end if;

  v_name := coalesce(nullif(trim(coalesce(p_name, '')), ''), 'Untitled agent');
  v_base_slug := private.slugify(v_name);
  v_slug := v_base_slug;

  while exists (
    select 1 from public.agents
    where user_id = v_user_id and slug = v_slug and deleted_at is null
  ) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  end loop;

  insert into public.agents (user_id, workspace_id, name, slug, description, status)
  values (v_user_id, v_workspace_id, v_name, v_slug, v_prompt, 'draft')
  returning id into v_agent_id;

  insert into public.agent_versions (
    agent_id, version_number, spec, change_summary, source_prompt, created_by
  )
  values (
    v_agent_id, 1,
    private.default_agent_spec(v_name, coalesce(v_prompt, '')),
    'Initial draft skeleton',
    v_prompt,
    v_user_id
  )
  returning id into v_version_id;

  update public.agents set draft_version_id = v_version_id where id = v_agent_id;

  insert into public.builder_threads (agent_id, user_id)
  values (v_agent_id, v_user_id)
  returning id into v_builder_thread_id;

  if v_prompt is not null then
    insert into public.builder_messages (thread_id, agent_id, user_id, role, content)
    values (v_builder_thread_id, v_agent_id, v_user_id, 'user', v_prompt);
  end if;

  if p_create_live_thread then
    insert into public.live_threads (agent_id, user_id)
    values (v_agent_id, v_user_id)
    returning id into v_live_thread_id;
  end if;

  return jsonb_build_object(
    'agent_id', v_agent_id,
    'version_id', v_version_id,
    'builder_thread_id', v_builder_thread_id,
    'live_thread_id', v_live_thread_id,
    'workspace_id', v_workspace_id
  );
end;
$$;

revoke all on function public.create_agent_workspace(text, text, boolean, uuid) from public, anon;
grant execute on function public.create_agent_workspace(text, text, boolean, uuid)
  to authenticated, service_role;
