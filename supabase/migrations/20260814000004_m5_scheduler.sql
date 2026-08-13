-- M5 — real scheduler: due-based claiming, idempotent occurrences, email audit.

alter table public.agent_schedules
  add column if not exists next_run_at timestamptz,
  add column if not exists last_run_at timestamptz,
  add column if not exists last_success_at timestamptz,
  add column if not exists failure_count integer not null default 0,
  add column if not exists notify_email text,
  add column if not exists instruction text,
  add column if not exists recurrence jsonb not null default '{}';

create index if not exists agent_schedules_due_idx
  on public.agent_schedules (enabled, next_run_at)
  where enabled = true;

-- One row per fired occurrence — the unique key makes re-ticks idempotent.
create table if not exists public.schedule_occurrences (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.agent_schedules (id) on delete cascade,
  occurrence_key text not null,
  run_id uuid references public.runs (id) on delete set null,
  status text not null default 'enqueued' check (
    status in ('enqueued', 'succeeded', 'failed', 'skipped')
  ),
  created_at timestamptz not null default now()
);

create unique index if not exists schedule_occurrences_key_unique
  on public.schedule_occurrences (occurrence_key);

create index if not exists schedule_occurrences_schedule_idx
  on public.schedule_occurrences (schedule_id, created_at desc);

alter table public.schedule_occurrences enable row level security;
revoke all on public.schedule_occurrences from authenticated, anon;
grant all on public.schedule_occurrences to service_role;

-- Audit of terminal notification emails. A delivery failure never fails the run.
create table if not exists public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  agent_id uuid references public.agents (id) on delete cascade,
  run_id uuid references public.runs (id) on delete set null,
  to_email text not null,
  subject text,
  status text not null default 'sent' check (status in ('sent', 'skipped', 'failed')),
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists email_deliveries_agent_idx
  on public.email_deliveries (agent_id, created_at desc);

alter table public.email_deliveries enable row level security;
revoke all on public.email_deliveries from authenticated, anon;
grant all on public.email_deliveries to service_role;

-- Atomic claim of due schedules: FOR UPDATE SKIP LOCKED so concurrent ticks never
-- claim the same row. Marks last_run_at as a claim stamp; the caller recomputes
-- next_run_at. Idempotency across a claim window is guaranteed by occurrence_key.
create or replace function public.claim_due_schedules(p_limit integer default 25)
returns setof public.agent_schedules
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.agent_schedules;
begin
  for v_row in
    select *
    from public.agent_schedules
    where enabled = true
      and (next_run_at is null or next_run_at <= now())
    order by next_run_at nulls first
    for update skip locked
    limit p_limit
  loop
    update public.agent_schedules
    set last_run_at = now(), updated_at = now()
    where id = v_row.id;
    return next v_row;
  end loop;
  return;
end;
$$;

revoke all on function public.claim_due_schedules(integer) from public, anon, authenticated;
grant execute on function public.claim_due_schedules(integer) to service_role;
