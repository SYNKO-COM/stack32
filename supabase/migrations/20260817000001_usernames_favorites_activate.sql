-- Production publish hardening: usernames, favorites, atomic deployment activation.

-- ---------------------------------------------------------------------------
-- 1. Unique Stack32 usernames on profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists username text;

comment on column public.profiles.username is
  'Canonical lowercase Stack32 username (URL-safe). NULL allowed for legacy onboarded users until first publish.';

-- Extensible reserved list
create table if not exists public.reserved_usernames (
  username text primary key
);

comment on table public.reserved_usernames is
  'Reserved usernames that cannot be claimed. Extend by inserting rows.';

insert into public.reserved_usernames (username) values
  ('admin'), ('api'), ('auth'), ('agents'), ('agent'), ('login'), ('signup'),
  ('onboarding'), ('settings'), ('billing'), ('support'), ('stack32'),
  ('marketplace'), ('p'), ('www'), ('my-agents'), ('my_agents'), ('help'),
  ('docs'), ('status'), ('null'), ('undefined')
on conflict do nothing;

alter table public.reserved_usernames enable row level security;

create policy "reserved_usernames_select_authenticated"
  on public.reserved_usernames for select
  to authenticated
  using (true);

revoke insert, update, delete on public.reserved_usernames from authenticated, anon;

create or replace function private.normalize_username(p_raw text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(coalesce(p_raw, ''))), '');
$$;

create or replace function private.is_valid_username(p_username text)
returns boolean
language sql
immutable
as $$
  select p_username is not null
    and p_username ~ '^[a-z][a-z0-9_]{2,29}$';
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
    );
$$;

revoke all on function public.validate_username(text) from public;
grant execute on function public.validate_username(text) to authenticated, service_role;

-- Enforce shape when set (NULL allowed for legacy)
alter table public.profiles
  drop constraint if exists profiles_username_format;

alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[a-z][a-z0-9_]{2,29}$');

create unique index if not exists profiles_username_unique
  on public.profiles (username)
  where username is not null;

-- Availability check — no profile leakage
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

revoke all on function public.check_username_availability(text) from public;
grant execute on function public.check_username_availability(text) to authenticated, service_role;

-- Set / update own username (also used from settings)
create or replace function public.set_username(p_username text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_norm text := private.normalize_username(p_username);
  v_profile public.profiles;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not public.validate_username(v_norm) then
    raise exception 'invalid_username' using errcode = '22023';
  end if;

  update public.profiles
  set username = v_norm
  where id = v_user_id
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  return v_profile;
exception
  when unique_violation then
    raise exception 'username_taken' using errcode = '23505';
end;
$$;

revoke all on function public.set_username(text) from public;
grant execute on function public.set_username(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. complete_onboarding requires username for new completions
-- ---------------------------------------------------------------------------
drop function if exists public.complete_onboarding(
  text, text, text, text, text, text, text, text, text, text, text
);

create or replace function public.complete_onboarding(
  p_discovery_source text,
  p_role text,
  p_first_name text default null,
  p_phone text default null,
  p_primary_goal text default null,
  p_discovery_other_detail text default null,
  p_role_other_detail text default null,
  p_company_name text default null,
  p_company_size text default null,
  p_intended_agent_type text default null,
  p_locale text default null,
  p_username text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile public.profiles;
  v_norm text := private.normalize_username(p_username);
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_discovery_source is null or p_discovery_source not in (
    'googleSearch', 'youtube', 'twitter', 'linkedin', 'tiktok',
    'instagram', 'reddit', 'chatgpt', 'friends', 'other'
  ) then
    raise exception 'invalid_discovery_source' using errcode = '22023';
  end if;

  if p_role is null or p_role not in (
    'founder', 'freelancer', 'marketer', 'developer',
    'sales', 'student', 'employee', 'other'
  ) then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  -- New onboarding completions must pick a username.
  if v_norm is null or not public.validate_username(v_norm) then
    raise exception 'invalid_username' using errcode = '22023';
  end if;

  insert into public.onboarding_responses (
    user_id, discovery_source, discovery_other_detail,
    role, role_other_detail, primary_goal,
    company_name, company_size, intended_agent_type
  )
  values (
    v_user_id, p_discovery_source, nullif(trim(coalesce(p_discovery_other_detail, '')), ''),
    p_role, nullif(trim(coalesce(p_role_other_detail, '')), ''),
    nullif(trim(coalesce(p_primary_goal, '')), ''),
    nullif(trim(coalesce(p_company_name, '')), ''),
    nullif(trim(coalesce(p_company_size, '')), ''),
    nullif(trim(coalesce(p_intended_agent_type, '')), '')
  )
  on conflict (user_id) do update set
    discovery_source = excluded.discovery_source,
    discovery_other_detail = excluded.discovery_other_detail,
    role = excluded.role,
    role_other_detail = excluded.role_other_detail,
    primary_goal = excluded.primary_goal,
    company_name = excluded.company_name,
    company_size = excluded.company_size,
    intended_agent_type = excluded.intended_agent_type;

  update public.profiles
  set
    first_name = coalesce(nullif(trim(coalesce(p_first_name, '')), ''), first_name),
    phone = coalesce(nullif(trim(coalesce(p_phone, '')), ''), phone),
    locale = case when p_locale in ('en', 'fr') then p_locale else locale end,
    username = v_norm,
    onboarding_completed = true,
    onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where id = v_user_id
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'profile_missing' using errcode = 'P0002';
  end if;

  return v_profile;
exception
  when unique_violation then
    raise exception 'username_taken' using errcode = '23505';
end;
$$;

revoke all on function public.complete_onboarding(
  text, text, text, text, text, text, text, text, text, text, text, text
) from public, anon;
grant execute on function public.complete_onboarding(
  text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Agent favorites
-- ---------------------------------------------------------------------------
create table if not exists public.agent_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, agent_id)
);

create index if not exists agent_favorites_agent_id_idx
  on public.agent_favorites (agent_id);

alter table public.agent_favorites enable row level security;

create policy "agent_favorites_select_own"
  on public.agent_favorites for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "agent_favorites_insert_own"
  on public.agent_favorites for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "agent_favorites_delete_own"
  on public.agent_favorites for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke update on public.agent_favorites from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4. Atomic activation RPC + public agent resolution helpers
-- ---------------------------------------------------------------------------
create or replace function public.activate_agent_deployment(
  p_deployment_id uuid,
  p_user_id uuid,
  p_agent_id uuid,
  p_agent_version_id uuid,
  p_snapshot_id text default null,
  p_runtime_version text default null,
  p_environment text default 'production',
  p_idempotency_key text default null
)
returns public.agent_deployments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents;
  v_existing public.agent_deployments;
  v_row public.agent_deployments;
  v_runtime jsonb;
begin
  if p_environment is null or p_environment not in ('production', 'staging') then
    raise exception 'invalid_environment' using errcode = '22023';
  end if;

  -- Lock agent row to serialize concurrent publishes for the same agent.
  select * into v_agent
  from public.agents
  where id = p_agent_id and user_id = p_user_id and deleted_at is null
  for update;

  if v_agent.id is null then
    raise exception 'agent_not_found' using errcode = 'P0002';
  end if;

  -- Idempotent retry: same deployment id already active → return it.
  select * into v_existing
  from public.agent_deployments
  where id = p_deployment_id;

  if v_existing.id is not null and v_existing.status = 'active' then
    return v_existing;
  end if;

  -- Idempotent by version: if this version is already the active production deploy, return it.
  if p_agent_version_id is not null then
    select * into v_existing
    from public.agent_deployments
    where agent_id = p_agent_id
      and environment = p_environment
      and status = 'active'
      and agent_version_id = p_agent_version_id
    limit 1;

    if v_existing.id is not null then
      return v_existing;
    end if;
  end if;

  update public.agent_deployments
  set
    status = 'disabled',
    unpublished_at = coalesce(unpublished_at, now())
  where agent_id = p_agent_id
    and environment = p_environment
    and status = 'active';

  v_runtime := jsonb_build_object(
    'hosted', true,
    'model', 'shared_runtime',
    'queue', 'run_queue',
    'snapshot_id', p_snapshot_id,
    'runtime_version', coalesce(p_runtime_version, ''),
    'idempotency_key', p_idempotency_key
  );

  insert into public.agent_deployments (
    id, user_id, agent_id, agent_version_id, environment, status,
    published_at, runtime_config
  )
  values (
    p_deployment_id, p_user_id, p_agent_id, p_agent_version_id, p_environment, 'active',
    now(), v_runtime
  )
  returning * into v_row;

  update public.agents
  set
    status = 'published',
    published_version_id = p_agent_version_id
  where id = p_agent_id and user_id = p_user_id;

  return v_row;
end;
$$;

revoke all on function public.activate_agent_deployment from public;
grant execute on function public.activate_agent_deployment to service_role;

-- Safe public metadata for an authenticated consumer (no secrets).
create or replace function public.resolve_published_agent(
  p_username text,
  p_agent_slug text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_norm text := private.normalize_username(p_username);
  v_slug text := lower(trim(coalesce(p_agent_slug, '')));
  v_profile public.profiles;
  v_agent public.agents;
  v_deploy public.agent_deployments;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if v_norm is null or v_slug = '' then
    return null;
  end if;

  select * into v_profile
  from public.profiles
  where username = v_norm
  limit 1;

  if v_profile.id is null then
    return null;
  end if;

  select * into v_agent
  from public.agents
  where user_id = v_profile.id
    and slug = v_slug
    and deleted_at is null
    and status = 'published'
  limit 1;

  if v_agent.id is null then
    return null;
  end if;

  select * into v_deploy
  from public.agent_deployments
  where agent_id = v_agent.id
    and environment = 'production'
    and status = 'active'
  order by published_at desc nulls last
  limit 1;

  if v_deploy.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'agentId', v_agent.id,
    'name', v_agent.name,
    'slug', v_agent.slug,
    'description', v_agent.description,
    'iconKey', v_agent.icon_key,
    'creatorUsername', v_profile.username,
    'creatorUserId', v_profile.id,
    'deploymentId', v_deploy.id,
    'versionId', v_deploy.agent_version_id,
    'publishedAt', v_deploy.published_at
  );
end;
$$;

revoke all on function public.resolve_published_agent(text, text) from public;
grant execute on function public.resolve_published_agent(text, text) to authenticated, service_role;
