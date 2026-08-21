-- Account deletion: full purge (no transfer to @stack32).
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

select ok(
  (select id from public.profiles where username = 'stack32') is not null,
  'platform @stack32 profile still exists (reserved identity)'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  '00000000-0000-0000-0000-000000000000',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'authenticated', 'authenticated', 'deleter@stack32.test',
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

insert into public.workspaces (id, user_id, name)
values (
  '22222222-2222-2222-2222-222222222222',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'Del workspace'
);

insert into public.agents (id, user_id, workspace_id, name, slug, status, listing_visibility)
values
(
  '33333333-3333-3333-3333-333333333333',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '22222222-2222-2222-2222-222222222222',
  'Published Agent',
  'published-agent',
  'published',
  'public'
),
(
  '44444444-4444-4444-4444-444444444444',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '22222222-2222-2222-2222-222222222222',
  'Draft Agent',
  'draft-agent',
  'draft',
  'private'
);

set local role service_role;

select is(
  (public.prepare_account_deletion('cccccccc-cccc-cccc-cccc-cccccccccccc')->>'mode'),
  'full_purge',
  'prepare runs in full_purge mode'
);

select is(
  (public.prepare_account_deletion('cccccccc-cccc-cccc-cccc-cccccccccccc')->>'transferredCount')::int,
  0,
  'prepare transfers zero agents to platform'
);

select is(
  (select status from public.agents where id = '33333333-3333-3333-3333-333333333333'),
  'built',
  'published agent is unpublished before auth delete'
);

select is(
  (select listing_visibility from public.agents where id = '33333333-3333-3333-3333-333333333333'),
  'private',
  'listing visibility forced private'
);

select is(
  (
    select a.user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid
    from public.agents a
    where a.id = '33333333-3333-3333-3333-333333333333'
  ),
  true,
  'agent remains on deleting user until auth cascade'
);

select * from finish();
rollback;
