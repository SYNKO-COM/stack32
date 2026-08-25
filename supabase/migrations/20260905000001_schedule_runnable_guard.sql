-- Stack32 — stop firing schedules for agents that cannot possibly run.
--
-- claim_due_schedules only checked `enabled` and the due time, so a schedule
-- attached to an agent with no published version fired on every tick, created
-- a run and a queue job, and failed with AGENT_SPEC_INVALID — forever. In
-- production that burned ~216 runs a day (no LLM cost: the live runtime bails
-- before calling a model, but the queue and run history filled with noise).
--
-- The claim now skips schedules whose agent is deleted, archived, suspended
-- for billing, or has no published version to load a spec from. Nothing is
-- disabled: the schedule stays enabled and resumes on its own as soon as the
-- owner publishes the agent or billing is restored.

create or replace function public.claim_due_schedules(p_limit integer default 25)
returns setof public.agent_schedules
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.agent_schedules;
begin
  for v_row in
    select s.*
    from public.agent_schedules s
    where s.enabled = true
      and (s.next_run_at is null or s.next_run_at <= now())
      and exists (
        select 1
        from public.agents a
        where a.id = s.agent_id
          and a.deleted_at is null
          and a.status not in ('archived', 'suspended_billing')
          -- The live runtime resolves the published spec; without one it can
          -- only return AGENT_SPEC_INVALID.
          and a.published_version_id is not null
      )
    order by s.next_run_at nulls first
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
$function$;
