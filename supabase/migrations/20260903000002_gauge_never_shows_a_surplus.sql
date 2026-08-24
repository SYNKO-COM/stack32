-- The gauge must never read more than the plan allows.
--
-- Free credits accumulate for the life of the account, so a lapsed Pro
-- subscriber who had spent 150 of their 200 credits came back to the free
-- plan and saw "150 / 25" — a surplus that means nothing to anyone. The same
-- person who had spent only 10 should still read "10 / 25", because that is
-- true and useful.
--
-- So the displayed consumption is clamped to the allowance: min(used, limit).
-- Only the display changes. `exhausted` and the real dollar figures are
-- computed from the unclamped values, so the budget gate keeps refusing
-- exactly when it did before.

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
  shown_credits numeric;
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
  -- Never paint a bar past its own end.
  shown_credits := least(used_credits, ent.period_credits);

  return jsonb_build_object(
    'planKey', ent.plan_key,
    'billingInterval', ent.billing_interval,
    'creditsMonthly', ent.credits_monthly,
    'periodCredits', ent.period_credits,
    'usedCredits', round(shown_credits, 2),
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
