-- Enforce plan maxAgents inside create_agent_workspace (server-side).

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
  v_ent record;
  v_agent_count integer;
  v_max_agents integer;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_ent from public.resolve_user_entitlements(v_user_id);
  v_max_agents := case v_ent.plan_key
    when 'free' then 1
    when 'starter' then 5
    when 'pro' then 30
    when 'scale' then null
    else 1
  end;

  if v_max_agents is not null then
    select count(*)::integer into v_agent_count
    from public.agents
    where user_id = v_user_id
      and deleted_at is null
      and status <> 'archived';
    if v_agent_count >= v_max_agents then
      raise exception 'plan_agent_limit' using errcode = 'P0001';
    end if;
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
