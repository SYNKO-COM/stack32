-- Allow Instagram as an onboarding discovery source.

alter table public.onboarding_responses
  drop constraint if exists onboarding_responses_discovery_source_check;

alter table public.onboarding_responses
  add constraint onboarding_responses_discovery_source_check check (
    discovery_source in (
      'googleSearch', 'youtube', 'twitter', 'linkedin', 'tiktok',
      'instagram', 'reddit', 'chatgpt', 'friends', 'other'
    )
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
  p_locale text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile public.profiles;
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
    'founder', 'freelancer', 'marketer', 'developer', 'sales', 'student', 'other'
  ) then
    raise exception 'invalid_role' using errcode = '22023';
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
    onboarding_completed = true,
    onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where id = v_user_id
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'profile_missing' using errcode = 'P0002';
  end if;

  return v_profile;
end;
$$;

revoke all on function public.complete_onboarding(
  text, text, text, text, text, text, text, text, text, text, text
) from public, anon;
grant execute on function public.complete_onboarding(
  text, text, text, text, text, text, text, text, text, text, text
) to authenticated, service_role;
