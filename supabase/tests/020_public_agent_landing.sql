-- Public agent landing: anon may resolve published metadata + read public reviews.
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'authenticated', 'authenticated', 'publisher@stack32.test',
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);

select lives_ok(
  $$select public.complete_onboarding(
    'googleSearch', 'founder', 'Pub', null, null, null, null, null, null, null, null, 'pub_landing'
  )$$,
  'publisher onboarding ok'
);

reset role;
set local role service_role;

insert into public.workspaces (id, user_id, name)
values (
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'W'
);

insert into public.agents (
  id, user_id, workspace_id, name, slug, description, icon_key, status,
  listing_visibility, listing_tagline
) values (
  '22222222-2222-2222-2222-222222222222',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'Landing Agent',
  'landing-agent',
  'Helps with demos',
  'bot',
  'published',
  'public',
  'Demo tagline'
);

insert into public.agent_versions (
  id, agent_id, version_number, spec, test_status, created_by
) values (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  1,
  '{"schema_version":"2","tools":[{"tool":"canva_create","enabled":true,"provider":"canva","app_id":"canva"},{"tool":"notion_page","enabled":true,"provider":"notion","app_id":"notion"}]}'::jsonb,
  'passed',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

update public.agents
set published_version_id = '33333333-3333-3333-3333-333333333333'
where id = '22222222-2222-2222-2222-222222222222';

insert into public.agent_deployments (
  id, user_id, agent_id, agent_version_id, environment, status, published_at
) values (
  '44444444-4444-4444-4444-444444444444',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  'production',
  'active',
  now()
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select ok(
  (select public.resolve_published_agent('pub_landing', 'landing-agent')->>'name') = 'Landing Agent',
  'anon resolve_published_agent returns name'
);

select ok(
  (select public.resolve_published_agent('pub_landing', 'landing-agent')->>'tagline') = 'Demo tagline',
  'anon resolve includes tagline'
);

select ok(
  jsonb_array_length(
    public.resolve_published_agent('pub_landing', 'landing-agent')->'modules'
  ) >= 1,
  'anon resolve includes modules'
);

select lives_ok(
  $$select public.list_agent_reviews('22222222-2222-2222-2222-222222222222')$$,
  'anon can list reviews for public agent'
);

select * from finish();
rollback;
