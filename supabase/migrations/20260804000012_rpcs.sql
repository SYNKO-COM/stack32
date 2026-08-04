-- Stack32 Phase 2 — workspace RPCs.
-- create_agent_workspace: atomic creation of agent + version 1 + threads.
-- soft_delete_agent / restore is handled through agents.deleted_at updates,
-- plus a dedicated RPC for a single, safe entry point.

-- ---------------------------------------------------------------------------
-- private.slugify — minimal, dependency-free slug helper.
-- ---------------------------------------------------------------------------
create or replace function private.slugify(input text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g')),
      ''
    ),
    'agent'
  );
$$;

revoke all on function private.slugify(text) from public, anon;
grant execute on function private.slugify(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- private.default_agent_spec — safe minimal AgentSpec skeleton (NOT
-- AI-generated; the real Builder Agent lands in Phase 3+).
-- ---------------------------------------------------------------------------
create or replace function private.default_agent_spec(agent_name text, goal text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'schema_version', '1.0',
    'name', coalesce(nullif(trim(agent_name), ''), 'Untitled agent'),
    'goal', coalesce(goal, ''),
    'instructions', jsonb_build_object(
      'system', '',
      'tone', 'professional',
      'language', 'auto'
    ),
    'model_profile', 'balanced',
    'input', jsonb_build_object('channels', jsonb_build_array('chat'), 'attachments', '[]'::jsonb),
    'tools', '[]'::jsonb,
    'knowledge', jsonb_build_object('source_ids', '[]'::jsonb, 'retrieval_enabled', false),
    'memory', jsonb_build_object('conversation', true, 'semantic', false),
    'rules', '[]'::jsonb,
    'output', jsonb_build_object('format', 'markdown', 'schema', null),
    'starter_prompts', '[]'::jsonb,
    'runtime', jsonb_build_object('max_steps', 8, 'timeout_seconds', 60, 'max_tool_calls', 6)
  );
$$;

revoke all on function private.default_agent_spec(text, text) from public, anon;
grant execute on function private.default_agent_spec(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- create_agent_workspace
-- ---------------------------------------------------------------------------
create or replace function public.create_agent_workspace(
  p_name text default null,
  p_prompt text default null,
  p_create_live_thread boolean default true
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
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_name := coalesce(nullif(trim(coalesce(p_name, '')), ''), 'Untitled agent');
  v_base_slug := private.slugify(v_name);
  v_slug := v_base_slug;

  -- Unique active slug per user.
  while exists (
    select 1 from public.agents
    where user_id = v_user_id and slug = v_slug and deleted_at is null
  ) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  end loop;

  insert into public.agents (user_id, name, slug, description, status)
  values (v_user_id, v_name, v_slug, v_prompt, 'draft')
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
    'live_thread_id', v_live_thread_id
  );
end;
$$;

revoke all on function public.create_agent_workspace(text, text, boolean) from public, anon;
grant execute on function public.create_agent_workspace(text, text, boolean)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- soft_delete_agent — single safe entry point for agent deletion.
-- ---------------------------------------------------------------------------
create or replace function public.soft_delete_agent(p_agent_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  update public.agents
  set deleted_at = now()
  where id = p_agent_id and user_id = v_user_id and deleted_at is null;

  if not found then
    raise exception 'agent_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.soft_delete_agent(uuid) from public, anon;
grant execute on function public.soft_delete_agent(uuid) to authenticated, service_role;
