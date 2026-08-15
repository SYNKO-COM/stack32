-- Usernames, favorites RLS, activate_agent_deployment atomicity.
begin;
create extension if not exists pgtap with schema extensions;

select plan(19);

-- Two users ---------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'authenticated', 'authenticated', 'user-a@stack32.test',
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
),
(
  '00000000-0000-0000-0000-000000000000',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'authenticated', 'authenticated', 'user-b@stack32.test',
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

-- Act as user A
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);

select lives_ok(
  $$select public.complete_onboarding(
    'googleSearch', 'founder', 'Ada', null, null, null, null, null, null, null, null, 'Ada_Lovelace'
  )$$,
  'onboarding accepts mixed-case username and normalizes'
);

select is(
  (select username from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'ada_lovelace',
  'username stored lowercase'
);

select throws_ok(
  $$select public.set_username('admin')$$,
  'invalid_username',
  'reserved username rejected'
);

select throws_ok(
  $$select public.set_username('ab')$$,
  'invalid_username',
  'too-short username rejected'
);

-- User B takes a different name, then cannot claim A's (case-insensitive)
select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);

select lives_ok(
  $$select public.complete_onboarding(
    'youtube', 'developer', 'Bob', null, null, null, null, null, null, null, null, 'bob_builder'
  )$$,
  'user B onboarding succeeds'
);

select throws_ok(
  $$select public.set_username('ADA_LOVELACE')$$,
  'username_taken',
  'case-insensitive uniqueness enforced'
);

select is(
  (select (public.check_username_availability('Ada_Lovelace')->>'available')::boolean),
  false,
  'availability reports taken for other user casing'
);

-- Favorites RLS -----------------------------------------------------------
-- Create an agent owned by A (service role for insert simplicity)
reset role;
set local role service_role;

insert into public.workspaces (id, user_id, name)
values (
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'A workspace'
);

insert into public.agents (
  id, user_id, workspace_id, name, slug, status
) values (
  '22222222-2222-2222-2222-222222222222',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'Public Agent',
  'public-agent',
  'published'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);

select lives_ok(
  $$insert into public.agent_favorites (user_id, agent_id)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222')$$,
  'user B can favorite agent'
);

select is(
  (select count(*)::int from public.agent_favorites
   where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  1,
  'B sees own favorite'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);

select is(
  (select count(*)::int from public.agent_favorites),
  0,
  'user A cannot see B favorites via RLS'
);

select throws_like(
  $$insert into public.agent_favorites (user_id, agent_id)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222')$$,
  '%row-level security%',
  'cannot insert favorite as another user'
);

-- activate_agent_deployment atomicity (service_role) ----------------------
reset role;
set local role service_role;

insert into public.agent_versions (
  id, agent_id, version_number, spec, test_status, created_by
) values (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  1,
  '{"schema_version":"1.0"}'::jsonb,
  'passed',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

select lives_ok(
  $$select public.activate_agent_deployment(
    '44444444-4444-4444-4444-444444444444',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    'snap-1',
    '1.0.0',
    'production',
    'idem-1'
  )$$,
  'activate creates active deployment'
);

select is(
  (select status from public.agent_deployments
   where id = '44444444-4444-4444-4444-444444444444'),
  'active',
  'deployment active'
);

select is(
  (select published_version_id::text from public.agents
   where id = '22222222-2222-2222-2222-222222222222'),
  '33333333-3333-3333-3333-333333333333',
  'agent published_version_id set'
);

-- Second activate with same deployment id is idempotent
select is(
  (select id::text from public.activate_agent_deployment(
    '44444444-4444-4444-4444-444444444444',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    'snap-1',
    '1.0.0',
    'production',
    'idem-1'
  )),
  '44444444-4444-4444-4444-444444444444',
  'idempotent activate returns same deployment'
);

select is(
  (select count(*)::int from public.agent_deployments
   where agent_id = '22222222-2222-2222-2222-222222222222'
     and environment = 'production'
     and status = 'active'),
  1,
  'only one active production deployment'
);

-- New version disables previous
insert into public.agent_versions (
  id, agent_id, version_number, spec, test_status, created_by
) values (
  '55555555-5555-5555-5555-555555555555',
  '22222222-2222-2222-2222-222222222222',
  2,
  '{"schema_version":"1.0"}'::jsonb,
  'passed',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

select lives_ok(
  $$select public.activate_agent_deployment(
    '66666666-6666-6666-6666-666666666666',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '22222222-2222-2222-2222-222222222222',
    '55555555-5555-5555-5555-555555555555',
    'snap-2',
    '1.0.1',
    'production',
    'idem-2'
  )$$,
  'activate new version'
);

select is(
  (select status from public.agent_deployments
   where id = '44444444-4444-4444-4444-444444444444'),
  'disabled',
  'previous deployment disabled atomically'
);

select is(
  (select count(*)::int from public.agent_deployments
   where agent_id = '22222222-2222-2222-2222-222222222222'
     and environment = 'production'
     and status = 'active'),
  1,
  'still exactly one active production deployment'
);

select * from finish();
rollback;
