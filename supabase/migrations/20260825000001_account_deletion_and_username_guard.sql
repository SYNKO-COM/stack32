-- Account deletion: transfer published agents to @stack32, harden username guard.

-- ---------------------------------------------------------------------------
-- 1. Username must never contain "stack32" as a contiguous substring
-- ---------------------------------------------------------------------------
create or replace function private.username_contains_forbidden_brand(p_username text)
returns boolean
language sql
immutable
as $$
  -- Reject any username that embeds "stack32" (e.g. mystack32, stack32_bot).
  -- Spaces are already stripped by normalize_username; underscores stay.
  select p_username is not null
    and position('stack32' in lower(p_username)) > 0;
$$;

create or replace function private.is_valid_username(p_username text)
returns boolean
language sql
immutable
as $$
  select p_username is not null
    and p_username ~ '^[a-z][a-z0-9_]{2,29}$'
    and not private.username_contains_forbidden_brand(p_username);
$$;

create or replace function public.validate_username(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_valid_username(private.normalize_username(p_username))
    and not exists (
      select 1 from public.reserved_usernames r
      where r.username = private.normalize_username(p_username)
    )
    and not private.username_contains_forbidden_brand(
      private.normalize_username(p_username)
    );
$$;

create or replace function public.check_username_availability(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_norm text := private.normalize_username(p_username);
  v_valid boolean;
  v_taken boolean;
  v_reserved boolean;
  v_reason text;
begin
  if v_norm is null then
    return jsonb_build_object(
      'normalizedUsername', null,
      'available', false,
      'valid', false,
      'reason', 'empty'
    );
  end if;

  -- Brand substring check before format so "stack 32" / "my_stack32" report reserved.
  if private.username_contains_forbidden_brand(v_norm) then
    return jsonb_build_object(
      'normalizedUsername', v_norm,
      'available', false,
      'valid', false,
      'reason', 'reserved'
    );
  end if;

  v_valid := private.is_valid_username(v_norm);
  if not v_valid then
    return jsonb_build_object(
      'normalizedUsername', v_norm,
      'available', false,
      'valid', false,
      'reason', 'invalid'
    );
  end if;

  select exists (
    select 1 from public.reserved_usernames r where r.username = v_norm
  ) into v_reserved;
  if v_reserved then
    return jsonb_build_object(
      'normalizedUsername', v_norm,
      'available', false,
      'valid', false,
      'reason', 'reserved'
    );
  end if;

  select exists (
    select 1 from public.profiles p
    where p.username = v_norm
      and p.id is distinct from (select auth.uid())
  ) into v_taken;

  if v_taken then
    v_reason := 'taken';
  else
    v_reason := null;
  end if;

  return jsonb_build_object(
    'normalizedUsername', v_norm,
    'available', not v_taken,
    'valid', true,
    'reason', v_reason
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Platform identity @stack32 (owns reclaimed published agents)
-- ---------------------------------------------------------------------------
-- Fixed UUID kept stable across environments.
do $$
declare
  v_platform_id uuid := 'a0000000-0000-4000-8000-000000000032';
begin
  if not exists (select 1 from auth.users where id = v_platform_id) then
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_platform_id,
      'authenticated',
      'authenticated',
      'platform@stack32.internal',
      extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"],"stack32_platform":true}',
      '{"full_name":"Stack32"}',
      now(),
      now()
    );
  end if;

  if not exists (
    select 1 from auth.identities
    where user_id = v_platform_id and provider = 'email'
  ) then
    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      v_platform_id,
      format(
        '{"sub":"%s","email":"platform@stack32.internal","email_verified":true}',
        v_platform_id
      )::jsonb,
      'email',
      v_platform_id::text,
      now(),
      now(),
      now()
    );
  end if;

  -- Trigger may have created the profile; ensure username + onboarding flags.
  insert into public.profiles (id, first_name, full_name, onboarding_completed, onboarding_completed_at, username)
  values (v_platform_id, 'Stack32', 'Stack32', true, now(), 'stack32')
  on conflict (id) do update
    set username = 'stack32',
        first_name = coalesce(public.profiles.first_name, 'Stack32'),
        full_name = coalesce(public.profiles.full_name, 'Stack32'),
        onboarding_completed = true,
        onboarding_completed_at = coalesce(public.profiles.onboarding_completed_at, now());

  insert into public.workspaces (user_id, name)
  select v_platform_id, 'Stack32'
  where not exists (
    select 1 from public.workspaces w where w.user_id = v_platform_id
  );
end $$;

create or replace function private.platform_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.profiles
  where username = 'stack32'
  limit 1;
$$;

revoke all on function private.platform_user_id() from public, anon, authenticated;
grant execute on function private.platform_user_id() to service_role;

-- ---------------------------------------------------------------------------
-- 3. Prepare account deletion: reclaim published agents, then caller deletes auth user
-- ---------------------------------------------------------------------------
create or replace function private.prepare_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_platform uuid := private.platform_user_id();
  v_workspace uuid;
  v_agent record;
  v_new_slug text;
  v_transferred int := 0;
  v_agent_ids uuid[] := '{}';
begin
  if p_user_id is null then
    raise exception 'user_id_required' using errcode = '22023';
  end if;

  if v_platform is null then
    raise exception 'platform_user_missing' using errcode = 'P0002';
  end if;

  if p_user_id = v_platform then
    raise exception 'cannot_delete_platform_account' using errcode = '42501';
  end if;

  select w.id into v_workspace
  from public.workspaces w
  where w.user_id = v_platform
  order by w.created_at asc
  limit 1;

  if v_workspace is null then
    insert into public.workspaces (user_id, name)
    values (v_platform, 'Stack32')
    returning id into v_workspace;
  end if;

  -- Transfer each published (non-deleted) agent to the platform account.
  for v_agent in
    select a.id, a.slug
    from public.agents a
    where a.user_id = p_user_id
      and a.deleted_at is null
      and a.status = 'published'
  loop
    v_new_slug := v_agent.slug;
    if exists (
      select 1 from public.agents x
      where x.user_id = v_platform
        and x.slug = v_new_slug
        and x.deleted_at is null
        and x.id <> v_agent.id
    ) then
      v_new_slug := left(v_agent.slug, 40) || '-' || substr(replace(v_agent.id::text, '-', ''), 1, 8);
    end if;

    -- Drop personal OAuth bindings / secrets — do not transfer user credentials.
    update public.agent_tool_configurations
    set connection_id = null
    where agent_id = v_agent.id
      and user_id = p_user_id;

    delete from public.agent_connection_bindings
    where agent_id = v_agent.id
      and user_id = p_user_id;

    delete from public.user_secrets
    where agent_id = v_agent.id
      and user_id = p_user_id;

    update public.agent_versions
    set created_by = v_platform
    where agent_id = v_agent.id
      and created_by = p_user_id;

    update public.agent_deployments
    set user_id = v_platform
    where agent_id = v_agent.id
      and user_id = p_user_id;

    update public.agent_projects
    set user_id = v_platform
    where agent_id = v_agent.id
      and user_id = p_user_id;

    update public.agent_project_snapshots
    set user_id = v_platform
    where agent_id = v_agent.id
      and user_id = p_user_id;

    update public.agent_project_files
    set user_id = v_platform
    where agent_id = v_agent.id
      and user_id = p_user_id;

    update public.agent_memories
    set user_id = v_platform
    where agent_id = v_agent.id
      and user_id = p_user_id;

    update public.agent_schedules
    set user_id = v_platform
    where agent_id = v_agent.id
      and user_id = p_user_id;

    update public.agent_triggers
    set user_id = v_platform
    where agent_id = v_agent.id
      and user_id = p_user_id;

    update public.agent_tool_configurations
    set user_id = v_platform
    where agent_id = v_agent.id
      and user_id = p_user_id;

    update public.agent_approval_requests
    set user_id = v_platform
    where agent_id = v_agent.id
      and user_id = p_user_id;

    update public.builder_threads
    set user_id = v_platform
    where agent_id = v_agent.id
      and user_id = p_user_id;

    update public.builder_messages
    set user_id = v_platform
    where agent_id = v_agent.id
      and user_id = p_user_id;

    update public.live_threads
    set user_id = v_platform
    where agent_id = v_agent.id
      and user_id = p_user_id;

    update public.live_messages
    set user_id = v_platform
    where agent_id = v_agent.id
      and user_id = p_user_id;

    update public.runs
    set user_id = v_platform
    where agent_id = v_agent.id
      and user_id = p_user_id;

    update public.knowledge_sources
    set user_id = v_platform,
        storage_path = case
          when storage_path like p_user_id::text || '/%'
            then v_platform::text || substr(storage_path, length(p_user_id::text) + 1)
          else storage_path
        end
    where agent_id = v_agent.id
      and user_id = p_user_id;

    update public.knowledge_chunks
    set user_id = v_platform
    where agent_id = v_agent.id
      and user_id = p_user_id;

    update public.attachments
    set user_id = v_platform,
        storage_path = case
          when storage_path like p_user_id::text || '/%'
            then v_platform::text || substr(storage_path, length(p_user_id::text) + 1)
          else storage_path
        end
    where agent_id = v_agent.id
      and user_id = p_user_id;

    update public.artifacts
    set user_id = v_platform,
        storage_path = case
          when storage_path like p_user_id::text || '/%'
            then v_platform::text || substr(storage_path, length(p_user_id::text) + 1)
          else storage_path
        end
    where agent_id = v_agent.id
      and user_id = p_user_id;

    update public.usage_events
    set user_id = v_platform
    where agent_id = v_agent.id
      and user_id = p_user_id;

    update public.llm_validations
    set user_id = v_platform
    where agent_id = v_agent.id
      and user_id = p_user_id;

    update public.builder_workspaces
    set user_id = v_platform
    where agent_id = v_agent.id
      and user_id = p_user_id;

    -- Move ownership last (workspace first to satisfy NOT NULL + cascade rules).
    update public.agents
    set user_id = v_platform,
        workspace_id = v_workspace,
        slug = v_new_slug,
        updated_at = now()
    where id = v_agent.id
      and user_id = p_user_id;

    v_agent_ids := array_append(v_agent_ids, v_agent.id);
    v_transferred := v_transferred + 1;
  end loop;

  return jsonb_build_object(
    'platformUserId', v_platform,
    'transferredAgentIds', to_jsonb(v_agent_ids),
    'transferredCount', v_transferred
  );
end;
$$;

revoke all on function private.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function private.prepare_account_deletion(uuid) to service_role;

-- Callable from Edge Function via service role wrapper in public schema.
create or replace function public.prepare_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only service_role (Edge Function) may call this.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return private.prepare_account_deletion(p_user_id);
end;
$$;

revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
