-- M5: harden run_queue with idempotency key + lease heartbeat support

alter table public.run_queue
  add column if not exists idempotency_key text,
  add column if not exists heartbeat_at timestamptz;

create unique index if not exists run_queue_idempotency_uidx
  on public.run_queue (idempotency_key)
  where idempotency_key is not null;

create or replace function public.heartbeat_run_queue_job(
  p_run_id uuid,
  p_owner text,
  p_lease_seconds integer default 180
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated integer;
begin
  update public.run_queue
  set
    lease_expires_at = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 900))),
    heartbeat_at = now()
  where run_id = p_run_id
    and status = 'leased'
    and lease_owner = p_owner;
  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

revoke all on function public.heartbeat_run_queue_job(uuid, text, integer) from public;
grant execute on function public.heartbeat_run_queue_job(uuid, text, integer) to service_role;
