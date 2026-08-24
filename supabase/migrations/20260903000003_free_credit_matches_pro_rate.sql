-- Price a free credit exactly like a Pro one.
--
-- Free credits were $0.052 each ($1.30 / 25) against Pro's $0.055, so a
-- balance carried over from a lapsed subscription drifted 6%: ten Pro credits
-- spent came back as 10.6 free ones. Dollars are the store of record, and the
-- only way the two agree is for the rate to match. 25 x $0.055 = $1.375.
--
-- Everything except the free branch is copied verbatim from
-- 20260902000001_free_plan_first_build.sql.

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
    return 1.375 * greatest(p_credits_monthly, 25) / 25.0;
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
