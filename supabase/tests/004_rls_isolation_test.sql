-- RLS isolation: anonymous denial + user A vs user B + service-only tables.
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- Two users; user A gets a full workspace via the RPC.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'authenticated', 'authenticated', 'user-a@stack32.test',
   extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'authenticated', 'authenticated', 'user-b@stack32.test',
   extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select lives_ok(
  $$select public.create_agent_workspace('Agent A', 'prompt A')$$,
  'user A workspace created'
);

-- Capture A's thread id so user B can attempt a forged insert against it.
create temp table _user_a_thread as
select id, agent_id from public.builder_threads limit 1;

-- ---------------------------------------------------------------------------
-- Anonymous users see nothing.
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '', true);

select is((select count(*)::int from public.profiles), 0, 'anon: no profiles');
select is((select count(*)::int from public.agents), 0, 'anon: no agents');
select is((select count(*)::int from public.builder_messages), 0, 'anon: no builder messages');
select is((select count(*)::int from public.live_threads), 0, 'anon: no live threads');
select throws_like(
  $$insert into public.agents (user_id, name, slug)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'X', 'x')$$,
  '%denied%',
  'anon: cannot insert agents (privilege revoked)'
);
select throws_like(
  $$select * from public.webhook_events$$,
  '%denied%',
  'anon: webhook_events fully blocked'
);

-- ---------------------------------------------------------------------------
-- User B cannot see or touch user A data.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);

select is((select count(*)::int from public.agents), 0, 'B sees no agents of A');
select is((select count(*)::int from public.agent_versions), 0, 'B sees no versions of A');
select is((select count(*)::int from public.builder_threads), 0, 'B sees no builder threads of A');
select is((select count(*)::int from public.builder_messages), 0, 'B sees no builder messages of A');
select is((select count(*)::int from public.live_threads), 0, 'B sees no live threads of A');
select is(
  (select count(*)::int from public.profiles
   where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0, 'B cannot read A profile'
);

-- B cannot insert into A's builder thread, even with the exact thread id.
select throws_like(
  $$insert into public.builder_messages (thread_id, agent_id, user_id, role, content)
    select t.id, t.agent_id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'user', 'intrusion'
    from _user_a_thread t$$,
  '%row-level security%',
  'B cannot post into A thread'
);

-- B cannot forge an assistant message even in a thread B owns.
select lives_ok(
  $$select public.create_agent_workspace('Agent B', null)$$,
  'user B workspace created'
);
select throws_like(
  $$insert into public.builder_messages (thread_id, agent_id, user_id, role, content)
    select t.id, t.agent_id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'assistant', 'fake AI'
    from public.builder_threads t
    where t.user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' limit 1$$,
  '%row-level security%',
  'B cannot insert assistant-role messages'
);
select throws_like(
  $$insert into public.runs (user_id, agent_id, run_type)
    select 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', a.id, 'build'
    from public.agents a where a.user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' limit 1$$,
  '%denied%',
  'B cannot forge runs'
);
select throws_like(
  $$insert into public.usage_events (user_id, event_name)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'fake')$$,
  '%denied%',
  'B cannot forge usage events'
);
select throws_like(
  $$update public.subscriptions set status = 'active'
    where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  '%denied%',
  'B cannot update subscriptions'
);

-- B can read the public tool catalog.
select is((select count(*)::int from public.tool_catalog), 6, 'B reads enabled tools');

-- B cannot flip privileged profile columns directly.
select throws_like(
  $$update public.profiles set onboarding_completed = true
    where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  '%denied%',
  'B cannot set onboarding_completed directly'
);

-- ---------------------------------------------------------------------------
-- Soft deletion hides agents from normal queries.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.soft_delete_agent(
      (select id from public.agents
       where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
         and deleted_at is null limit 1))$$,
  'B soft-deletes own agent'
);

select * from finish();
rollback;
