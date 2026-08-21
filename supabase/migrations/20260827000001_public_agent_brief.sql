-- Expose safe brief fields (goal, instructions, rules) on public agent resolve.

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
  v_goal text;
  v_role text;
  v_instructions text;
  v_rules jsonb := '[]'::jsonb;
  v_rule jsonb;
  v_rule_text text;
  v_rule_seen text[] := array[]::text[];
  v_spec jsonb;
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

  v_spec := coalesce(v_version.spec, '{}'::jsonb);

  -- Safe module labels from published tools (no secrets / configs).
  if jsonb_typeof(v_spec -> 'tools') = 'array' then
    for v_tool in
      select value from jsonb_array_elements(v_spec -> 'tools')
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

  -- Goal / objective (portable, no secrets).
  v_goal := coalesce(
    nullif(trim(v_spec ->> 'goal'), ''),
    nullif(trim(v_spec -> 'identity' ->> 'description'), ''),
    nullif(trim(v_agent.description), '')
  );
  v_role := nullif(trim(v_spec -> 'identity' ->> 'role'), '');

  -- Instructions: object.system or plain string.
  if jsonb_typeof(v_spec -> 'instructions') = 'object' then
    v_instructions := nullif(trim(v_spec -> 'instructions' ->> 'system'), '');
  elsif jsonb_typeof(v_spec -> 'instructions') = 'string' then
    v_instructions := nullif(trim(v_spec ->> 'instructions'), '');
  end if;

  -- Rules from top-level rules + behavioral_rules (string or {text}).
  if jsonb_typeof(v_spec -> 'rules') = 'array' then
    for v_rule in select value from jsonb_array_elements(v_spec -> 'rules')
    loop
      if jsonb_typeof(v_rule) = 'string' then
        v_rule_text := nullif(trim(v_rule #>> '{}'), '');
      else
        v_rule_text := coalesce(
          nullif(trim(v_rule ->> 'text'), ''),
          nullif(trim(v_rule ->> 'rule'), ''),
          nullif(trim(v_rule ->> 'body'), '')
        );
      end if;
      if v_rule_text is null then
        continue;
      end if;
      if lower(v_rule_text) = any (v_rule_seen) then
        continue;
      end if;
      v_rule_seen := array_append(v_rule_seen, lower(v_rule_text));
      v_rules := v_rules || jsonb_build_array(to_jsonb(v_rule_text));
      if jsonb_array_length(v_rules) >= 24 then
        exit;
      end if;
    end loop;
  end if;

  if jsonb_typeof(v_spec -> 'instructions' -> 'behavioral_rules') = 'array'
     and jsonb_array_length(v_rules) < 24 then
    for v_rule in
      select value from jsonb_array_elements(v_spec -> 'instructions' -> 'behavioral_rules')
    loop
      if jsonb_typeof(v_rule) = 'string' then
        v_rule_text := nullif(trim(v_rule #>> '{}'), '');
      else
        v_rule_text := nullif(trim(v_rule ->> 'text'), '');
      end if;
      if v_rule_text is null then
        continue;
      end if;
      if lower(v_rule_text) = any (v_rule_seen) then
        continue;
      end if;
      v_rule_seen := array_append(v_rule_seen, lower(v_rule_text));
      v_rules := v_rules || jsonb_build_array(to_jsonb(v_rule_text));
      if jsonb_array_length(v_rules) >= 24 then
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
    'modules', v_modules,
    'role', v_role,
    'goal', v_goal,
    'instructions', v_instructions,
    'rules', v_rules
  );
end;
$$;

revoke all on function public.resolve_published_agent(text, text) from public;
grant execute on function public.resolve_published_agent(text, text) to anon, authenticated, service_role;
