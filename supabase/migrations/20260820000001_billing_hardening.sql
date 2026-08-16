-- Billing hardening: suspended_billing, atomic budget gate, webhook claim helper.
-- Additive / backwards-compatible. Runs after plan_entitlements_credits.

-- ---------------------------------------------------------------------------
-- Agents: reversible billing suspension (preserve agents / snapshots).
-- ---------------------------------------------------------------------------
alter table public.agents
  add column if not exists pre_suspension_status text;

alter table public.agents drop constraint if exists agents_status_check;
alter table public.agents
  add constraint agents_status_check check (
    status in (
      'draft',
      'building',
      'waiting_for_input',
      'needs_setup',
      'built',
      'ready',
      'needs_attention',
      'published',
      'suspended_billing',
      'archived'
    )
  );

comment on column public.agents.pre_suspension_status is
  'Status before suspended_billing; restored when Whop entitlement returns.';

-- ---------------------------------------------------------------------------
-- Atomic period-budget availability check (advisory lock + usage sum).
-- Returns true when the user may start a chargeable run.
-- ---------------------------------------------------------------------------
create or replace function public.assert_period_budget_available(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  ent record;
  used numeric;
begin
  if p_user_id is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select * into ent from public.resolve_user_entitlements(p_user_id);
  used := public.user_period_usage_usd(p_user_id);

  if used >= ent.budget_usd then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.assert_period_budget_available(uuid) from public, anon, authenticated;
grant execute on function public.assert_period_budget_available(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Suspend / restore published agents for a user (service_role only).
-- ---------------------------------------------------------------------------
create or replace function public.suspend_agents_for_billing(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.agents
  set
    pre_suspension_status = status,
    status = 'suspended_billing',
    updated_at = timezone('utc', now())
  where user_id = p_user_id
    and deleted_at is null
    and status = 'published';
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.restore_agents_after_billing(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.agents
  set
    status = coalesce(nullif(pre_suspension_status, ''), 'published'),
    pre_suspension_status = null,
    updated_at = timezone('utc', now())
  where user_id = p_user_id
    and deleted_at is null
    and status = 'suspended_billing';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.suspend_agents_for_billing(uuid) from public, anon, authenticated;
revoke all on function public.restore_agents_after_billing(uuid) from public, anon, authenticated;
grant execute on function public.suspend_agents_for_billing(uuid) to service_role;
grant execute on function public.restore_agents_after_billing(uuid) to service_role;

-- Claim a stuck/failed webhook for exclusive reprocessing.
create or replace function public.claim_webhook_event(
  p_provider text,
  p_provider_event_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated integer;
begin
  update public.webhook_events
  set
    status = 'processing',
    attempt_count = attempt_count + 1,
    last_error = null,
    updated_at = timezone('utc', now())
  where provider = p_provider
    and provider_event_id = p_provider_event_id
    and status in ('pending', 'failed', 'processing')
    and (
      status <> 'processing'
      or updated_at < timezone('utc', now()) - interval '2 minutes'
    );
  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

revoke all on function public.claim_webhook_event(text, text) from public, anon, authenticated;
grant execute on function public.claim_webhook_event(text, text) to service_role;
