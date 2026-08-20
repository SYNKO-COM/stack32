-- Tighten Free plan: 5 credits/mo, lifetime 1 agent (incl. deleted), Live message cap via app.

alter table public.subscriptions
  alter column credits_monthly set default 5;

create or replace function public.resolve_user_entitlements(p_user_id uuid)
returns table (
  plan_key text,
  billing_interval text,
  credits_monthly integer,
  period_start timestamptz,
  period_end timestamptz,
  budget_usd numeric,
  period_credits integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sub public.subscriptions%rowtype;
  v_plan text;
  v_interval text;
  v_credits int;
  v_base_budget numeric;
  v_base_credits int;
  v_start timestamptz;
  v_end timestamptz;
  v_months int;
begin
  select * into sub
  from public.subscriptions s
  where s.user_id = p_user_id
  limit 1;

  if sub.id is not null
     and sub.status in ('active', 'trialing')
     and coalesce(sub.plan_key, 'free') <> 'free' then
    v_plan := sub.plan_key;
    v_interval := sub.billing_interval;
    v_credits := greatest(1, least(10000, sub.credits_monthly));
    v_start := coalesce(sub.current_period_start, date_trunc('month', timezone('utc', now())));
    v_end := sub.current_period_end;
  else
    v_plan := 'free';
    v_interval := 'monthly';
    v_credits := 5;
    v_start := date_trunc('month', timezone('utc', now()));
    v_end := v_start + interval '1 month';
  end if;

  -- Base platform budgets (USD / month) at each plan's base credit tier.
  if v_plan = 'starter' then
    v_base_budget := 6;
    v_base_credits := 100;
  elsif v_plan = 'pro' then
    v_base_budget := 11;
    v_base_credits := 200;
  elsif v_plan = 'scale' then
    v_base_budget := 21;
    v_base_credits := 400;
  else
    v_base_budget := 0.2;
    v_base_credits := 5;
  end if;

  if v_interval = 'annual' then
    v_months := 12;
    if v_end is null then
      v_end := v_start + interval '1 year';
    end if;
  else
    v_months := 1;
    v_start := date_trunc('month', timezone('utc', now()));
    v_end := v_start + interval '1 month';
  end if;

  return query
  select
    v_plan,
    v_interval,
    v_credits,
    v_start,
    v_end,
    round((v_base_budget * v_credits::numeric / v_base_credits) * v_months, 6),
    v_credits * v_months;
end;
$$;

-- Free: count every agent ever created (including soft-deleted / archived).
-- Paid: keep counting only active non-deleted agents.
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
    if v_ent.plan_key = 'free' then
      select count(*)::integer into v_agent_count
      from public.agents
      where user_id = v_user_id;
    else
      select count(*)::integer into v_agent_count
      from public.agents
      where user_id = v_user_id
        and deleted_at is null
        and status <> 'archived';
    end if;
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

-- Align existing free subscription rows that still carry the old 25-credit default.
update public.subscriptions
set credits_monthly = 5
where coalesce(plan_key, 'free') = 'free'
  and credits_monthly = 25;

-- Lifetime Live user-message counter (survives thread clear / cascade deletes).
alter table public.profiles
  add column if not exists live_user_message_count integer not null default 0;

comment on column public.profiles.live_user_message_count is
  'Lifetime count of Live (Agent IA) user messages — used for Free plan caps.';

create or replace function private.bump_live_user_message_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'user' and new.user_id is not null then
    update public.profiles
    set live_user_message_count = live_user_message_count + 1
    where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bump_live_user_message_count on public.live_messages;
create trigger trg_bump_live_user_message_count
  after insert on public.live_messages
  for each row execute function private.bump_live_user_message_count();

-- Backfill from current messages (best-effort; cleared threads already lost history).
update public.profiles p
set live_user_message_count = coalesce(c.cnt, 0)
from (
  select user_id, count(*)::integer as cnt
  from public.live_messages
  where role = 'user'
  group by user_id
) c
where p.id = c.user_id
  and p.live_user_message_count < c.cnt;
