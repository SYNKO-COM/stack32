-- Mobile/tablet journey. Desktop onboarding and existing entitlements are unchanged.
create table public.onboarding_projects (
  id uuid primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  state jsonb not null,
  status text not null default 'draft' check (status in ('draft','preparing','ready','failed','launched')),
  agent_id uuid references public.agents(id) on delete set null,
  version_id uuid references public.agent_versions(id) on delete set null,
  preparation_run_id uuid references public.runs(id) on delete set null,
  launch_run_id uuid references public.runs(id) on delete set null,
  brief text,
  control text,
  preparation_started_at timestamptz,
  lease_until timestamptz,
  lease_token uuid,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.onboarding_projects enable row level security;
create policy onboarding_projects_select_own on public.onboarding_projects for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.onboarding_projects from anon, authenticated;
grant select on public.onboarding_projects to authenticated;

create or replace function public.save_onboarding_project(p_id uuid, p_state jsonb)
returns public.onboarding_projects language plpgsql security definer set search_path = '' as $$
declare v public.onboarding_projects;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if jsonb_typeof(p_state) is distinct from 'object' or p_state->>'version' is distinct from '3'
     or jsonb_typeof(p_state->'answers') is distinct from 'object'
     or jsonb_typeof(p_state->'step') is distinct from 'string'
     or jsonb_typeof(p_state->'initialPrompt') is distinct from 'string'
     or jsonb_typeof(p_state->'updatedAt') is distinct from 'number'
     or length(p_state->>'step')>60 or length(p_state->>'initialPrompt')>4000
     or octet_length(p_state::text) > 48000 then raise exception 'invalid_journey'; end if;
  -- An anonymous id already claimed by a different account cannot be adopted.
  if exists(select 1 from public.onboarding_projects where id=p_id and user_id<>auth.uid()) then raise exception 'draft_already_claimed'; end if;
  insert into public.onboarding_projects(id,user_id,state) values(p_id,auth.uid(),p_state)
    on conflict(user_id) do update set state=case when onboarding_projects.status in ('draft','failed') and (excluded.state->>'updatedAt')::numeric >= (onboarding_projects.state->>'updatedAt')::numeric then excluded.state else onboarding_projects.state end, updated_at=now()
    returning * into v;
  return v;
end $$;
revoke all on function public.save_onboarding_project(uuid,jsonb) from public,anon;
grant execute on function public.save_onboarding_project(uuid,jsonb) to authenticated;

create or replace function public.begin_onboarding_preparation(p_brief text, p_control text default null)
returns public.onboarding_projects language plpgsql security definer set search_path = '' as $$
declare v public.onboarding_projects; created jsonb; thread uuid; rid uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v from public.onboarding_projects where user_id=auth.uid() for update;
  if not found then raise exception 'draft_missing'; end if;
  if v.status in ('preparing','ready','launched') then return v; end if;
  if length(trim(p_brief)) < 10 or length(p_brief)>8000 then raise exception 'invalid_brief'; end if;
  if v.agent_id is null then
    created := public.create_agent_workspace(p_name=>'Mon agent IA',p_prompt=>p_brief);
    v.agent_id := (created->>'agent_id')::uuid;
  end if;
  select id into thread from public.builder_threads where agent_id=v.agent_id and user_id=auth.uid() limit 1;
  insert into public.runs(user_id,agent_id,thread_id,run_type,input)
    values(auth.uid(),v.agent_id,thread,'build',jsonb_build_object('onboarding_project_id',v.id,'prompt',p_brief,'locale','fr')) returning id into rid;
  update public.onboarding_projects set status='preparing',agent_id=v.agent_id,preparation_run_id=rid,brief=p_brief,control=p_control,
    preparation_started_at=now(),lease_until=null,lease_token=null,error_code=null,updated_at=now() where id=v.id returning * into v;
  return v;
end $$;
revoke all on function public.begin_onboarding_preparation(text,text) from public,anon;
grant execute on function public.begin_onboarding_preparation(text,text) to authenticated;

-- Fenced claim + atomic finalization: duplicate Cloud Tasks cannot create versions twice.
create or replace function public.claim_onboarding_preparation(p_run_id uuid)
returns public.onboarding_projects language plpgsql security definer set search_path = '' as $$
declare v public.onboarding_projects;
begin
  update public.onboarding_projects set lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes'
    where preparation_run_id=p_run_id and status='preparing' and (lease_until is null or lease_until<now()) returning * into v;
  if v.id is not null then update public.runs set status='running',started_at=now() where id=p_run_id; end if;
  return v;
end $$;
create or replace function public.finish_onboarding_preparation(p_run_id uuid,p_token uuid,p_spec jsonb default null,p_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v public.onboarding_projects; vid uuid; n integer;
begin
  select * into v from public.onboarding_projects where preparation_run_id=p_run_id and lease_token=p_token and status='preparing' for update;
  if not found then return false; end if;
  if p_error is not null then
    update public.onboarding_projects set status='failed',error_code=left(p_error,80),lease_until=null,updated_at=now() where id=v.id;
    update public.runs set status='failed',error_code=left(p_error,80),completed_at=now() where id=p_run_id;
    return true;
  end if;
  if p_spec is null or jsonb_typeof(p_spec->'graph') is distinct from 'object' or coalesce(length(p_spec->>'goal'),0)<1 or coalesce(length(p_spec#>>'{identity,name}'),0)<1 then raise exception 'invalid_spec'; end if;
  perform 1 from public.agents where id=v.agent_id for update;
  select coalesce(max(version_number),0)+1 into n from public.agent_versions where agent_id=v.agent_id;
  insert into public.agent_versions(agent_id,version_number,spec,graph_spec,schema_compat,source_prompt,change_summary,validation_status,test_status,created_by)
    values(v.agent_id,n,p_spec,p_spec->'graph','v2',v.brief,'Prepared from mobile/tablet onboarding','valid','not_run',v.user_id) returning id into vid;
  update public.agents set draft_version_id=vid,name=left(p_spec#>>'{identity,name}',120),description=left(v.brief,2000) where id=v.agent_id;
  update public.onboarding_projects set status='ready',version_id=vid,lease_until=null,error_code=null,updated_at=now() where id=v.id;
  update public.runs set status='completed',output=jsonb_build_object('version_id',vid),completed_at=now() where id=p_run_id;
  return true;
end $$;
revoke all on function public.claim_onboarding_preparation(uuid) from public,anon,authenticated;
revoke all on function public.finish_onboarding_preparation(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_onboarding_preparation(uuid) to service_role;
grant execute on function public.finish_onboarding_preparation(uuid,uuid,jsonb,text) to service_role;

create or replace function public.launch_onboarding_agent()
returns public.onboarding_projects language plpgsql security definer set search_path = '' as $$
declare v public.onboarding_projects; tid uuid; rid uuid; ent record;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v from public.onboarding_projects where user_id=auth.uid() for update;
  if not found or v.status not in ('ready','launched') then raise exception 'agent_not_ready'; end if;
  select * into ent from public.resolve_user_entitlements(auth.uid());
  if ent.plan_key not in ('starter','pro','scale') then raise exception 'paid_access_required'; end if;
  if not exists(select 1 from public.subscriptions where user_id=auth.uid() and status in ('active','trialing') and (current_period_end is null or current_period_end>now())) then raise exception 'paid_access_required'; end if;
  if v.launch_run_id is not null then return v; end if;
  if now()<v.preparation_started_at+interval '50 seconds' then raise exception 'preparation_sequence_pending'; end if;
  select id into tid from public.live_threads where user_id=auth.uid() and agent_id=v.agent_id order by created_at limit 1;
  if tid is null then insert into public.live_threads(user_id,agent_id) values(auth.uid(),v.agent_id) returning id into tid; end if;
  -- Start with the resolved brief; missing connections/model use the existing runtime setup flow.
  insert into public.live_messages(thread_id,agent_id,user_id,role,content) values(tid,v.agent_id,auth.uid(),'user',v.brief);
  insert into public.runs(user_id,agent_id,agent_version_id,thread_id,run_type,input)
    values(auth.uid(),v.agent_id,v.version_id,tid,'live',jsonb_build_object('prompt',v.brief,'onboarding_launch',true,'locale','fr')) returning id into rid;
  update public.onboarding_projects set status='launched',launch_run_id=rid,updated_at=now() where id=v.id returning * into v;
  update public.profiles set onboarding_completed=true,onboarding_completed_at=coalesce(onboarding_completed_at,now()) where id=auth.uid();
  return v;
end $$;
revoke all on function public.launch_onboarding_agent() from public,anon;
grant execute on function public.launch_onboarding_agent() to authenticated;

create or replace function public.claim_onboarding_launch(p_run_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.runs r set status='running',started_at=now()
    where r.id=p_run_id and r.status='queued' and exists(
      select 1 from public.onboarding_projects p where p.launch_run_id=r.id and p.status='launched');
  return found;
end $$;
revoke all on function public.claim_onboarding_launch(uuid) from public,anon,authenticated;
grant execute on function public.claim_onboarding_launch(uuid) to service_role;

create or replace function public.complete_mobile_onboarding_checkpoint()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.onboarding_projects where user_id=auth.uid()) then raise exception 'draft_missing'; end if;
  update public.profiles set onboarding_completed=true,onboarding_completed_at=coalesce(onboarding_completed_at,now()) where id=auth.uid();
end $$;
revoke all on function public.complete_mobile_onboarding_checkpoint() from public,anon;
grant execute on function public.complete_mobile_onboarding_checkpoint() to authenticated;

-- Explicit review grants one execution of the exact reviewed arguments. A
-- resumed model may issue a new call id, but may not change recipients/content.
alter table public.agent_approval_requests add column if not exists execution_claimed_at timestamptz;
alter table public.agent_approval_requests add column if not exists execution_call_id text;
create or replace function public.consume_reviewed_action(p_user_id uuid,p_run_id uuid,p_tool_id text,p_call_id text,p_arguments jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare aid uuid;
begin
  select id into aid from public.agent_approval_requests
    where user_id=p_user_id and run_id=p_run_id and tool_id=p_tool_id and status='approved'
      and execution_claimed_at is null and payload->'arguments'=p_arguments
    order by decided_at,id for update skip locked limit 1;
  if aid is null then return false; end if;
  update public.agent_approval_requests set execution_claimed_at=now(),execution_call_id=left(p_call_id,200) where id=aid;
  return true;
end $$;
revoke all on function public.consume_reviewed_action(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.consume_reviewed_action(uuid,uuid,text,text,jsonb) to service_role;
