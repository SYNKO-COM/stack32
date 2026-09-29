-- Run ONLY in an empty disposable local PostgreSQL database, never remotely.
\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create table public.agents(id uuid primary key);
create table public.agent_installations(id uuid primary key);
create table public.live_threads(id uuid primary key);
\ir ../../supabase/migrations/20260928000001_browser_sessions.sql
insert into auth.users values ('00000000-0000-0000-0000-000000000001');
insert into agents values ('00000000-0000-0000-0000-000000000002');
insert into agent_installations values ('00000000-0000-0000-0000-000000000003');
insert into live_threads values ('00000000-0000-0000-0000-000000000004');
insert into browser_sessions(id,user_id,agent_id,installation_id,thread_id,origin,agent_name,state,expires_at,device_seen_at)
values('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004','https://test.example','Test','active',now()+interval '15 minutes',now());
do $$ begin
 if has_table_privilege('authenticated','browser_sessions','select') or has_table_privilege('anon','browser_commands','insert') or has_function_privilege('authenticated','browser_enqueue(uuid,jsonb)','execute') then raise exception 'client privilege leak'; end if;
end $$;
set role service_role;
select id from browser_enqueue('00000000-0000-0000-0000-000000000005','{"kind":"read","selector":"#region","purpose":"test"}');
do $$ begin
 begin
  perform * from browser_enqueue('00000000-0000-0000-0000-000000000005','{}');
  raise exception 'busy gate failed';
 exception when others then
  if sqlerrm <> 'BROWSER_BUSY' then raise; end if;
 end;
end $$;
update browser_commands set state='done';
update browser_sessions set steps=30;
do $$ begin
 begin
  perform * from browser_enqueue('00000000-0000-0000-0000-000000000005','{}');
  raise exception 'step gate failed';
 exception when others then
  if sqlerrm <> 'BROWSER_SESSION_UNAVAILABLE' then raise; end if;
 end;
end $$;
update browser_sessions set steps=1,web_seen_at=now()-interval '31 seconds';
do $$ begin
 begin
  perform * from browser_enqueue('00000000-0000-0000-0000-000000000005','{}');
  raise exception 'heartbeat gate failed';
 exception when others then
  if sqlerrm <> 'BROWSER_SESSION_UNAVAILABLE' then raise; end if;
 end;
end $$;
delete from browser_sessions;
do $$ begin if exists(select 1 from browser_commands) then raise exception 'revocation cascade failed'; end if; end $$;
reset role;
select 'PASS: grants, enqueue, concurrent command, step limit, heartbeat expiry, revocation cascade' as checks;
