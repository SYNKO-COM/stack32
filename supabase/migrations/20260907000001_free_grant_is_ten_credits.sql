-- Stack32 — the free grant becomes 10 credits instead of 25.
--
-- Same one-time, never-renewing shape as before; only the size changes. The
-- rate stays exactly the Pro rate ($0.055/credit), so 10 credits carry
-- $0.55 of AI budget and a balance inherited from a lapsed subscription still
-- converts one-for-one. Mirrors agent_service/billing/plans.py and
-- apps/web/lib/billing/plans.ts.
--
-- Both functions are replaced whole (rather than patched) so the free branch
-- and the paid branches stay in one readable place.

create or replace function public.effective_ai_budget_usd(
  p_plan_key text,
  p_billing_interval text,
  p_credits_monthly integer,
  p_effective_monthly_revenue_usd numeric default null
) returns numeric
language plpgsql
stable
as $$
declare
  base_budget numeric;
  base_credits numeric;
  scaled numeric;
  revenue_cap numeric;
  ratio constant numeric := 0.25;
begin
  if p_plan_key = 'free' then
    return 0.55 * greatest(p_credits_monthly, 10) / 10.0;
  end if;

  case p_plan_key
    when 'starter' then
      base_budget := case when p_billing_interval = 'annual' then 5.0 else 6.0 end;
      base_credits := 100.0;
    when 'pro' then
      base_budget := case when p_billing_interval = 'annual' then 10.0 else 11.0 end;
      base_credits := 200.0;
    when 'scale' then
      base_budget := case when p_billing_interval = 'annual' then 20.0 else 21.0 end;
      base_credits := 400.0;
    else
      base_budget := 6.0;
      base_credits := 100.0;
  end case;

  scaled := base_budget * greatest(p_credits_monthly, 1) / base_credits;

  if p_effective_monthly_revenue_usd is not null and p_effective_monthly_revenue_usd > 0 then
    revenue_cap := p_effective_monthly_revenue_usd * ratio;
    return least(scaled, revenue_cap);
  end if;
  return scaled;
end;
$$;

revoke all on function public.effective_ai_budget_usd(text, text, integer, numeric) from public;
grant execute on function public.effective_ai_budget_usd(text, text, integer, numeric) to service_role;

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
  v_start timestamptz;
  v_end timestamptz;
  v_months int;
  v_base_revenue numeric;
  v_scaled_revenue numeric;
  v_budget_monthly numeric;
  v_topup_credits int;
  v_topup_budget numeric;
  v_account_created timestamptz;
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
  else
    -- Free: one lifetime grant. The window opens at account creation and
    -- never closes, so usage accumulates forever and nothing renews.
    v_plan := 'free';
    v_interval := 'monthly';
    v_credits := 10;
    v_months := 1;
    select p.created_at into v_account_created
    from public.profiles p
    where p.id = p_user_id;
    v_start := coalesce(v_account_created, timestamptz '1970-01-01');
    v_end := null;
  end if;

  v_base_revenue := case v_plan
    when 'starter' then case when v_interval = 'annual' then 20.0 else 24.0 end
    when 'pro' then case when v_interval = 'annual' then 40.0 else 49.0 end
    when 'scale' then case when v_interval = 'annual' then 80.0 else 99.0 end
    else 0.0
  end;

  v_scaled_revenue := case
    when v_plan = 'starter' then v_base_revenue * v_credits / 100.0
    when v_plan = 'pro' then v_base_revenue * v_credits / 200.0
    when v_plan = 'scale' then v_base_revenue * v_credits / 400.0
    else 0.0
  end;

  v_budget_monthly := public.effective_ai_budget_usd(
    v_plan,
    v_interval,
    v_credits,
    nullif(v_scaled_revenue, 0)
  );

  select
    coalesce(sum(t.credits), 0)::integer,
    coalesce(sum(t.budget_usd), 0)
  into v_topup_credits, v_topup_budget
  from public.credit_topups t
  where t.user_id = p_user_id
    and t.status = 'fulfilled'
    and t.created_at >= v_start
    and (v_end is null or t.created_at < v_end);

  return query
  select
    v_plan,
    v_interval,
    v_credits,
    v_start,
    v_end,
    round(v_budget_monthly * v_months + coalesce(v_topup_budget, 0), 6),
    (v_credits * v_months) + coalesce(v_topup_credits, 0);
end;
$$;

revoke all on function public.resolve_user_entitlements(uuid) from public, anon, authenticated;
grant execute on function public.resolve_user_entitlements(uuid) to service_role;
grant execute on function public.resolve_user_entitlements(uuid) to authenticated;
