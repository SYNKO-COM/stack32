-- Plan entitlements + period credit/budget helpers (pre-Whop, Whop-ready).

alter table public.subscriptions
  add column if not exists plan_key text not null default 'free'
    check (plan_key in ('free', 'starter', 'pro', 'scale')),
  add column if not exists billing_interval text not null default 'monthly'
    check (billing_interval in ('monthly', 'annual')),
  add column if not exists credits_monthly integer not null default 25
    check (credits_monthly > 0 and credits_monthly <= 10000);

comment on column public.subscriptions.plan_key is
  'Stack32 plan key (free|starter|pro|scale). Whop provider_plan_id maps here.';
comment on column public.subscriptions.billing_interval is
  'monthly = reset each month; annual = yearly credit/budget pool.';
comment on column public.subscriptions.credits_monthly is
  'Selected monthly credit allotment (extras scale price + budget).';

-- ---------------------------------------------------------------------------
-- Resolve entitlements for a user (free defaults when no active sub).
-- ---------------------------------------------------------------------------
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
    v_credits := 25;
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
    v_base_budget := 1;
    v_base_credits := 25;
  end if;

  if v_interval = 'annual' then
    v_months := 12;
    if v_end is null then
      v_end := v_start + interval '1 year';
    end if;
  else
    v_months := 1;
    -- For monthly, always meter on the current UTC calendar month
    -- unless an explicit subscription window is shorter.
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

revoke all on function public.resolve_user_entitlements(uuid) from public, anon, authenticated;
grant execute on function public.resolve_user_entitlements(uuid) to service_role;
grant execute on function public.resolve_user_entitlements(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Period usage (USD) from usage_events within the user's billing period.
-- ---------------------------------------------------------------------------
create or replace function public.user_period_usage_usd(p_user_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ent record;
  used numeric;
begin
  select * into ent from public.resolve_user_entitlements(p_user_id);
  select coalesce(sum(
    coalesce(
      nullif(e.metadata ->> 'cost_usd', '')::numeric,
      e.estimated_cost,
      0
    )
  ), 0)
  into used
  from public.usage_events e
  where e.user_id = p_user_id
    and e.created_at >= ent.period_start
    and (ent.period_end is null or e.created_at < ent.period_end);
  return used;
end;
$$;

revoke all on function public.user_period_usage_usd(uuid) from public, anon, authenticated;
grant execute on function public.user_period_usage_usd(uuid) to service_role;

-- Keep monthly helper for backwards compatibility (calendar month).
create or replace function public.user_monthly_usage_usd(p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    coalesce(
      nullif(metadata ->> 'cost_usd', '')::numeric,
      estimated_cost,
      0
    )
  ), 0)
  from public.usage_events
  where user_id = p_user_id
    and created_at >= date_trunc('month', timezone('utc', now()));
$$;

-- ---------------------------------------------------------------------------
-- Credit summary for the app (authenticated can read own).
-- ---------------------------------------------------------------------------
create or replace function public.get_my_credit_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  ent record;
  used_usd numeric;
  used_credits numeric;
  usd_per_credit numeric;
begin
  if uid is null then
    return null;
  end if;

  select * into ent from public.resolve_user_entitlements(uid);
  used_usd := public.user_period_usage_usd(uid);
  usd_per_credit := case
    when ent.period_credits > 0 then ent.budget_usd / ent.period_credits
    else 0
  end;
  used_credits := case
    when usd_per_credit > 0 then used_usd / usd_per_credit
    else 0
  end;

  return jsonb_build_object(
    'planKey', ent.plan_key,
    'billingInterval', ent.billing_interval,
    'creditsMonthly', ent.credits_monthly,
    'periodCredits', ent.period_credits,
    'usedCredits', round(used_credits, 2),
    'remainingCredits', greatest(0, round(ent.period_credits - used_credits, 2)),
    'usedUsd', round(used_usd, 6),
    'budgetUsd', ent.budget_usd,
    'periodStart', ent.period_start,
    'periodEnd', ent.period_end,
    'exhausted', used_usd >= ent.budget_usd or used_credits >= ent.period_credits
  );
end;
$$;

revoke all on function public.get_my_credit_usage() from public, anon;
grant execute on function public.get_my_credit_usage() to authenticated;
grant execute on function public.get_my_credit_usage() to service_role;

-- Service-role budget gate used by agent-service.
create or replace function public.user_period_budget_status(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ent record;
  used_usd numeric;
begin
  select * into ent from public.resolve_user_entitlements(p_user_id);
  used_usd := public.user_period_usage_usd(p_user_id);
  return jsonb_build_object(
    'planKey', ent.plan_key,
    'billingInterval', ent.billing_interval,
    'creditsMonthly', ent.credits_monthly,
    'periodCredits', ent.period_credits,
    'budgetUsd', ent.budget_usd,
    'usedUsd', round(used_usd, 6),
    'exceeded', used_usd >= ent.budget_usd,
    'periodStart', ent.period_start,
    'periodEnd', ent.period_end
  );
end;
$$;

revoke all on function public.user_period_budget_status(uuid) from public, anon, authenticated;
grant execute on function public.user_period_budget_status(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Enforce workspace caps from plan entitlements.
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
  v_plan text;
  v_count integer;
  v_max integer;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select e.plan_key into v_plan
  from public.resolve_user_entitlements(v_user_id) e
  limit 1;

  v_max := case
    when v_plan in ('pro', 'scale') then null
    else 1
  end;

  if v_max is not null then
    select count(*)::integer into v_count
    from public.workspaces w
    where w.user_id = v_user_id;
    if v_count >= v_max then
      raise exception 'WORKSPACE_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  end if;

  insert into public.workspaces (user_id, name)
  values (v_user_id, coalesce(nullif(trim(coalesce(p_name, '')), ''), 'My workspace'))
  returning * into v_row;

  return v_row;
end;
$$;
