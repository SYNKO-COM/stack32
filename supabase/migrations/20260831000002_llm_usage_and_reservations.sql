-- LLM usage ledger, budget reservations, and pricing registry (additive).

create table if not exists public.model_pricing_registry (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text not null,
  input_usd_per_m numeric not null,
  cached_input_usd_per_m numeric not null default 0,
  output_usd_per_m numeric not null,
  budget_reservation_input_usd_per_m numeric,
  budget_reservation_output_usd_per_m numeric,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  source_version text not null default '1',
  created_at timestamptz not null default now(),
  unique (provider, model, effective_from)
);

create table if not exists public.llm_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid,
  idempotency_key text not null unique,
  reserved_usd numeric not null default 0,
  reserved_credits numeric not null default 0,
  consumed_usd numeric not null default 0,
  status text not null default 'held'
    check (status in ('held', 'released', 'consumed', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists llm_budget_reservations_user_idx
  on public.llm_budget_reservations (user_id, created_at desc);

create table if not exists public.llm_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  run_id uuid,
  thread_id uuid,
  billing_period_id text,
  source text not null default 'builder',
  profile text not null,
  stage text,
  provider text not null,
  model text not null,
  reasoning_effort text,
  input_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  reasoning_tokens integer not null default 0,
  provider_cost_usd numeric,
  estimated_cost_usd numeric not null default 0,
  final_cost_usd numeric not null default 0,
  credits_debited numeric not null default 0,
  credits_reserved numeric not null default 0,
  credits_refunded numeric not null default 0,
  plan_key text,
  billing_interval text,
  credits_monthly integer,
  platform_paid boolean not null default true,
  idempotency_key text not null unique,
  latency_ms integer not null default 0,
  success boolean not null default true,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists llm_usage_events_user_created_idx
  on public.llm_usage_events (user_id, created_at desc);
create index if not exists llm_usage_events_run_idx
  on public.llm_usage_events (run_id);
create index if not exists llm_usage_events_model_idx
  on public.llm_usage_events (model, created_at desc);

alter table public.model_pricing_registry enable row level security;
alter table public.llm_budget_reservations enable row level security;
alter table public.llm_usage_events enable row level security;

revoke all on public.model_pricing_registry from anon, authenticated;
revoke all on public.llm_budget_reservations from anon, authenticated;

create policy llm_usage_events_select_own on public.llm_usage_events
  for select to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.llm_usage_events from authenticated, anon;

-- Seed platform pricing (reservation uses Sonnet standard $3/$15).
insert into public.model_pricing_registry (
  provider, model, input_usd_per_m, cached_input_usd_per_m, output_usd_per_m,
  budget_reservation_input_usd_per_m, budget_reservation_output_usd_per_m, source_version
) values
  ('openai', 'gpt-5.6-luna', 0.20, 0.02, 1.20, null, null, '2026-08-22'),
  ('openai', 'gpt-5.6-terra', 2.00, 0.20, 12.00, null, null, '2026-08-22'),
  ('openai', 'gpt-5.6-sol', 5.00, 0.50, 30.00, null, null, '2026-08-22'),
  ('anthropic', 'claude-sonnet-5', 2.00, 0.0, 10.00, 3.00, 15.00, '2026-08-22'),
  ('openai', 'text-embedding-3-small', 0.02, 0.0, 0.0, null, null, '2026-08-22')
on conflict do nothing;

-- Interval-aware budget caps (annual effective monthly AI envelope).
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
  scaled numeric;
  revenue_cap numeric;
  ratio constant numeric := 0.25;
begin
  if p_plan_key = 'free' then
    return 0.20 * greatest(p_credits_monthly, 5) / 5.0;
  end if;

  case p_plan_key
    when 'starter' then
      base_budget := case when p_billing_interval = 'annual' then 5.0 else 6.0 end;
    when 'pro' then
      base_budget := case when p_billing_interval = 'annual' then 10.0 else 11.0 end;
    when 'scale' then
      base_budget := case when p_billing_interval = 'annual' then 20.0 else 21.0 end;
    else
      base_budget := 6.0;
  end case;

  scaled := base_budget * greatest(p_credits_monthly, 1) / case p_plan_key
    when 'starter' then 100.0
    when 'pro' then 200.0
    when 'scale' then 400.0
    else 100.0
  end;

  if p_effective_monthly_revenue_usd is not null and p_effective_monthly_revenue_usd > 0 then
    revenue_cap := p_effective_monthly_revenue_usd * ratio;
    return least(scaled, revenue_cap);
  end if;
  return scaled;
end;
$$;

revoke all on function public.effective_ai_budget_usd(text, text, integer, numeric) from public;
grant execute on function public.effective_ai_budget_usd(text, text, integer, numeric) to service_role;
