-- Account deletion: full purge of user agents (no transfer to @stack32).
-- Before auth.users cascade, archive anonymized product-learning signals.

create table if not exists private.product_learning_archive (
  id uuid primary key default gen_random_uuid(),
  archived_at timestamptz not null default now(),
  source_kind text not null check (
    source_kind in (
      'builder_prompt',
      'agent_brief',
      'run_error',
      'usage_signal'
    )
  ),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists product_learning_archive_kind_idx
  on private.product_learning_archive (source_kind, archived_at desc);

revoke all on table private.product_learning_archive from public, anon, authenticated;
grant select, insert on table private.product_learning_archive to service_role;

create or replace function private.prepare_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_platform uuid := private.platform_user_id();
  v_archived int := 0;
  v_agent_count int := 0;
  v_row record;
  v_spec jsonb;
  v_identity jsonb;
  v_instructions text;
  v_goal text;
  v_role text;
  v_rules jsonb;
  v_tools jsonb;
begin
  if p_user_id is null then
    raise exception 'user_id_required' using errcode = '22023';
  end if;

  if v_platform is not null and p_user_id = v_platform then
    raise exception 'cannot_delete_platform_account' using errcode = '42501';
  end if;

  -- Take agents offline immediately (public links / marketplace stop resolving).
  update public.agents
  set status = case when status = 'published' then 'built' else status end,
      published_version_id = null,
      listing_visibility = 'private',
      listing_tagline = null,
      updated_at = now()
  where user_id = p_user_id
    and deleted_at is null;

  select count(*)::int into v_agent_count
  from public.agents
  where user_id = p_user_id;

  -- 1) Anonymized builder prompts (no user_id / email / agent ids).
  for v_row in
    select left(bm.content, 4000) as content
    from public.builder_messages bm
    where bm.user_id = p_user_id
      and bm.role = 'user'
      and length(trim(bm.content)) >= 8
    order by bm.created_at desc
    limit 200
  loop
    insert into private.product_learning_archive (source_kind, payload)
    values (
      'builder_prompt',
      jsonb_build_object(
        'content', v_row.content,
        'archivedFrom', 'account_deletion'
      )
    );
    v_archived := v_archived + 1;
  end loop;

  -- 2) Agent briefs / structure (goal, role, instructions, rules, tool names).
  for v_row in
    select a.id, a.name, coalesce(a.draft_version_id, a.published_version_id) as version_id
    from public.agents a
    where a.user_id = p_user_id
    limit 100
  loop
    if v_row.version_id is null then
      continue;
    end if;

    select av.spec into v_spec
    from public.agent_versions av
    where av.id = v_row.version_id;

    if v_spec is null then
      continue;
    end if;

    v_identity := coalesce(v_spec -> 'identity', '{}'::jsonb);
    v_goal := nullif(trim(coalesce(v_spec ->> 'goal', '')), '');
    v_role := nullif(trim(coalesce(v_identity ->> 'role', '')), '');

    if jsonb_typeof(v_spec -> 'instructions') = 'object' then
      v_instructions := nullif(trim(coalesce(v_spec -> 'instructions' ->> 'system', '')), '');
    else
      v_instructions := nullif(trim(coalesce(v_spec ->> 'instructions', '')), '');
    end if;

    if jsonb_typeof(v_spec -> 'rules') = 'array' then
      v_rules := v_spec -> 'rules';
    else
      v_rules := '[]'::jsonb;
    end if;

    if jsonb_typeof(v_spec -> 'tools') = 'array' then
      select coalesce(jsonb_agg(distinct coalesce(t ->> 'tool', t ->> 'id')), '[]'::jsonb)
      into v_tools
      from jsonb_array_elements(v_spec -> 'tools') t;
    else
      v_tools := '[]'::jsonb;
    end if;

    if v_goal is null and v_role is null and v_instructions is null
       and jsonb_array_length(v_rules) = 0 and jsonb_array_length(v_tools) = 0 then
      continue;
    end if;

    insert into private.product_learning_archive (source_kind, payload)
    values (
      'agent_brief',
      jsonb_build_object(
        'goal', left(coalesce(v_goal, ''), 4000),
        'role', left(coalesce(v_role, ''), 500),
        'instructions', left(coalesce(v_instructions, ''), 8000),
        'rules', v_rules,
        'tools', v_tools,
        'archivedFrom', 'account_deletion'
      )
    );
    v_archived := v_archived + 1;
  end loop;

  -- 3) Failed run error patterns (no personal identifiers).
  for v_row in
    select r.run_type, r.error_code, left(coalesce(r.error_message, ''), 2000) as error_message, r.provider, r.model
    from public.runs r
    where r.user_id = p_user_id
      and r.status = 'failed'
      and (r.error_code is not null or coalesce(r.error_message, '') <> '')
    order by r.created_at desc
    limit 100
  loop
    insert into private.product_learning_archive (source_kind, payload)
    values (
      'run_error',
      jsonb_build_object(
        'runType', v_row.run_type,
        'errorCode', v_row.error_code,
        'errorMessage', v_row.error_message,
        'provider', v_row.provider,
        'model', v_row.model,
        'archivedFrom', 'account_deletion'
      )
    );
    v_archived := v_archived + 1;
  end loop;

  -- 4) Aggregated usage signals (counts only).
  with inserted as (
    insert into private.product_learning_archive (source_kind, payload)
    select
      'usage_signal',
      jsonb_build_object(
        'eventName', ue.event_name,
        'count', count(*)::int,
        'archivedFrom', 'account_deletion'
      )
    from public.usage_events ue
    where ue.user_id = p_user_id
    group by ue.event_name
    having count(*) > 0
    returning 1
  )
  select v_archived + count(*)::int into v_archived from inserted;

  -- Agents / personal data are removed when auth.users is deleted (ON DELETE CASCADE).
  return jsonb_build_object(
    'platformUserId', v_platform,
    'transferredAgentIds', '[]'::jsonb,
    'transferredCount', 0,
    'agentCount', v_agent_count,
    'archivedCount', v_archived,
    'mode', 'full_purge'
  );
end;
$$;

revoke all on function private.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function private.prepare_account_deletion(uuid) to service_role;

create or replace function public.prepare_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return private.prepare_account_deletion(p_user_id);
end;
$$;

revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
