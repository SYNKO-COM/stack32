-- Public agent landing: resolve + reviews readable without auth (safe metadata only).

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
  v_version public.agent_versions;
  v_avg numeric;
  v_count integer;
  v_modules jsonb := '[]'::jsonb;
  v_tool jsonb;
  v_label text;
  v_seen text[] := array[]::text[];
begin
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

  select * into v_version
  from public.agent_versions
  where id = coalesce(v_agent.published_version_id, v_deploy.agent_version_id)
  limit 1;

  select
    avg(r.rating)::numeric(10, 2),
    count(*)::integer
  into v_avg, v_count
  from public.agent_reviews r
  where r.agent_id = v_agent.id;

  -- Safe module labels from published tools (no secrets / configs).
  if v_version.id is not null and jsonb_typeof(v_version.spec -> 'tools') = 'array' then
    for v_tool in
      select value from jsonb_array_elements(v_version.spec -> 'tools')
    loop
      if coalesce((v_tool ->> 'enabled')::boolean, true) is false then
        continue;
      end if;
      v_label := coalesce(
        nullif(trim(v_tool ->> 'app_id'), ''),
        nullif(trim(v_tool ->> 'appId'), ''),
        nullif(trim(v_tool ->> 'provider'), ''),
        nullif(trim(v_tool ->> 'tool'), ''),
        nullif(trim(v_tool ->> 'name'), '')
      );
      if v_label is null then
        continue;
      end if;
      v_label := replace(replace(lower(v_label), '_', ' '), '-', ' ');
      if v_label = any (v_seen) then
        continue;
      end if;
      v_seen := array_append(v_seen, v_label);
      v_modules := v_modules || jsonb_build_array(jsonb_build_object(
        'label', initcap(v_label),
        'kind', 'integration'
      ));
      if jsonb_array_length(v_modules) >= 12 then
        exit;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'agentId', v_agent.id,
    'name', v_agent.name,
    'slug', v_agent.slug,
    'description', v_agent.description,
    'tagline', v_agent.listing_tagline,
    'iconKey', v_agent.icon_key,
    'listingVisibility', coalesce(v_agent.listing_visibility, 'private'),
    'creatorUsername', v_profile.username,
    'creatorUserId', v_profile.id,
    'deploymentId', v_deploy.id,
    'versionId', v_deploy.agent_version_id,
    'publishedAt', v_deploy.published_at,
    'avgRating', v_avg,
    'reviewCount', coalesce(v_count, 0),
    'modules', v_modules
  );
end;
$$;

revoke all on function public.resolve_published_agent(text, text) from public;
grant execute on function public.resolve_published_agent(text, text) to anon, authenticated, service_role;

create or replace function public.list_agent_reviews(p_agent_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
  v_uid uuid := (select auth.uid());
  v_public boolean := false;
begin
  select exists (
    select 1
    from public.agents a
    where a.id = p_agent_id
      and a.deleted_at is null
      and a.status = 'published'
      and coalesce(a.listing_visibility, 'private') = 'public'
  ) into v_public;

  if v_uid is null then
    if not v_public then
      raise exception 'not_authenticated' using errcode = '28000';
    end if;
  elsif not (
    private.owns_agent(p_agent_id)
    or private.can_use_published_agent(p_agent_id)
    or v_public
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'userId', r.user_id,
    'authorName', coalesce(nullif(pr.full_name, ''), nullif(pr.first_name, ''), pr.username, 'User'),
    'rating', r.rating,
    'body', r.body,
    'createdAt', r.created_at,
    'isMine', case when v_uid is null then false else r.user_id = v_uid end
  ) order by r.created_at desc), '[]'::jsonb)
  into v_out
  from public.agent_reviews r
  left join public.profiles pr on pr.id = r.user_id
  where r.agent_id = p_agent_id;

  return v_out;
end;
$$;

revoke all on function public.list_agent_reviews(uuid) from public;
grant execute on function public.list_agent_reviews(uuid) to anon, authenticated, service_role;
