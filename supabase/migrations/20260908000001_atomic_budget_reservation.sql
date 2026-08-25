-- Stack32 — concurrent runs must not spend the same remaining budget.
--
-- Every run read "remaining = plan budget - recorded usage" at start and used
-- that as its own ceiling. Three simultaneous runs each read the same $3 and
-- each believed it was theirs. Reservations make the arithmetic exclusive:
-- a run's ceiling is what it managed to RESERVE, and the reserve operation is
-- serialized per user with an advisory lock.
--
-- Lifecycle: reserve (held) → run spends → settle (usage_events carry the
-- real cost; the reservation stops counting). A held row older than 2 hours
-- is ignored by the arithmetic, so a crashed run cannot pin budget forever.

create table public.budget_reservations (
  run_id uuid primary key,
  user_id uuid not null,
  amount_usd numeric not null check (amount_usd >= 0),
  status text not null default 'held' check (status in ('held', 'settled')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index budget_reservations_user_held_idx
  on public.budget_reservations (user_id, status, created_at);

-- Service role only: the agent-service is the sole writer and reader.
alter table public.budget_reservations enable row level security;
revoke all on public.budget_reservations from anon, authenticated;

create or replace function public.reserve_run_budget(
  p_run_id uuid,
  p_user_id uuid,
  p_requested numeric
) returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing numeric;
  v_budget numeric := 0;
  v_spent numeric := 0;
  v_held numeric := 0;
  v_available numeric;
  v_granted numeric;
begin
  -- One user reserves at a time: the read-compute-write below is exclusive.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- Idempotent per run: a retry of the same run keeps its original grant.
  -- A zero grant reserved nothing, so it does not stick: the run may ask
  -- again and pick up budget another run has since released.
  select amount_usd into v_existing
  from public.budget_reservations
  where run_id = p_run_id and status = 'held';
  if found and v_existing > 0 then
    return v_existing;
  end if;

  select budget_usd into v_budget
  from public.resolve_user_entitlements(p_user_id);
  v_spent := coalesce(public.user_period_usage_usd(p_user_id), 0);

  select coalesce(sum(amount_usd), 0) into v_held
  from public.budget_reservations
  where user_id = p_user_id
    and status = 'held'
    and run_id <> p_run_id
    and created_at > now() - interval '2 hours';

  v_available := greatest(0, coalesce(v_budget, 0) - v_spent - v_held);
  v_granted := least(greatest(coalesce(p_requested, v_available), 0), v_available);

  insert into public.budget_reservations (run_id, user_id, amount_usd, status)
  values (p_run_id, p_user_id, v_granted, 'held')
  on conflict (run_id) do update
    set amount_usd = excluded.amount_usd,
        status = 'held',
        created_at = now(),
        settled_at = null;

  return v_granted;
end;
$$;

create or replace function public.settle_run_budget(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.budget_reservations
  set status = 'settled', settled_at = now()
  where run_id = p_run_id and status = 'held';
end;
$$;

revoke all on function public.reserve_run_budget(uuid, uuid, numeric)
  from public, anon, authenticated;
revoke all on function public.settle_run_budget(uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_run_budget(uuid, uuid, numeric) to service_role;
grant execute on function public.settle_run_budget(uuid) to service_role;
