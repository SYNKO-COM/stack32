-- RPC behavior: complete_onboarding, create_agent_workspace, soft_delete_agent.
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222222',
  'authenticated', 'authenticated', 'rpc-test@stack32.test',
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

-- Act as the authenticated user.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

-- complete_onboarding -----------------------------------------------------
select throws_ok(
  $$select public.complete_onboarding('not-a-source', 'founder')$$,
  'invalid_discovery_source',
  'rejects invalid discovery source'
);
select throws_ok(
  $$select public.complete_onboarding('googleSearch', 'astronaut')$$,
  'invalid_role',
  'rejects invalid role'
);

select lives_ok(
  $$select public.complete_onboarding('googleSearch', 'founder', 'Eva', '+33 600000000', 'Support agent', null, null, null, null, null, null, 'eva_rpc')$$,
  'complete_onboarding succeeds with valid values'
);
select is(
  (select onboarding_completed from public.profiles
   where id = '22222222-2222-2222-2222-222222222222'),
  true, 'profile marked complete'
);
select isnt(
  (select onboarding_completed_at from public.profiles
   where id = '22222222-2222-2222-2222-222222222222'),
  null, 'completion timestamp set'
);
select is(
  (select count(*)::int from public.onboarding_responses
   where user_id = '22222222-2222-2222-2222-222222222222'),
  1, 'one onboarding response row'
);

-- Duplicate submission upserts instead of failing.
select lives_ok(
  $$select public.complete_onboarding('youtube', 'developer', 'Eva', null, null, null, null, null, null, null, null, 'eva_rpc')$$,
  'duplicate onboarding submission is an upsert'
);
select is(
  (select discovery_source from public.onboarding_responses
   where user_id = '22222222-2222-2222-2222-222222222222'),
  'youtube', 'response updated on resubmission'
);

-- create_agent_workspace ---------------------------------------------------
select lives_ok(
  $$select public.create_agent_workspace('Support Agent', 'Answer my customers')$$,
  'create_agent_workspace succeeds'
);
select is(
  (select count(*)::int from public.agents
   where user_id = '22222222-2222-2222-2222-222222222222' and deleted_at is null),
  1, 'agent created'
);
select is(
  (select version_number from public.agent_versions v
   join public.agents a on a.id = v.agent_id
   where a.user_id = '22222222-2222-2222-2222-222222222222'),
  1, 'version 1 created'
);
select is(
  (select count(*)::int from public.builder_messages m
   join public.agents a on a.id = m.agent_id
   where a.user_id = '22222222-2222-2222-2222-222222222222' and m.role = 'user'),
  1, 'initial prompt stored as first builder user message'
);

-- Slug uniqueness: same name yields a suffixed slug.
select lives_ok(
  $$select public.create_agent_workspace('Support Agent', null)$$,
  'second agent with same name succeeds'
);
select is(
  (select count(distinct slug)::int from public.agents
   where user_id = '22222222-2222-2222-2222-222222222222' and deleted_at is null),
  2, 'slugs are unique per user'
);

-- soft_delete_agent ---------------------------------------------------------
select lives_ok(
  $$select public.soft_delete_agent(
      (select id from public.agents
       where user_id = '22222222-2222-2222-2222-222222222222'
         and deleted_at is null limit 1))$$,
  'soft_delete_agent succeeds'
);

select * from finish();
rollback;
