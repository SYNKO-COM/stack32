-- Reclaim expired leases so crashed workers cannot leave builds stuck forever.

create or replace function public.lease_run_queue_job(
  p_owner text,
  p_lease_seconds integer default 120
)
returns public.run_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.run_queue;
begin
  -- First: reclaim an expired lease (worker died mid-job).
  select *
  into v_row
  from public.run_queue
  where status = 'leased'
    and lease_expires_at is not null
    and lease_expires_at < now()
  order by lease_expires_at
  for update skip locked
  limit 1;

  if not found then
    select *
    into v_row
    from public.run_queue
    where status = 'pending'
      and available_at <= now()
    order by available_at
    for update skip locked
    limit 1;
  end if;

  if not found then
    return null;
  end if;

  update public.run_queue
  set
    status = 'leased',
    lease_owner = p_owner,
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    attempts = attempts + 1,
    updated_at = now(),
    last_error = case
      when v_row.status = 'leased' then coalesce(v_row.last_error, 'lease_reclaimed')
      else v_row.last_error
    end
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.lease_run_queue_job(text, integer)
  from public, anon, authenticated;
grant execute on function public.lease_run_queue_job(text, integer) to service_role;
