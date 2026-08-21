-- Account deletion + username brand guard.
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

-- Platform identity from migration -----------------------------------------
select ok(
  (select id from public.profiles where username = 'stack32') is not null,
  'platform @stack32 profile exists'
);

-- Two regular users --------------------------------------------------------
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
),
(
  '00000000-0000-0000-0000-000000000000',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'authenticated', 'authenticated', 'other@stack32.test',
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.set_username('mystack32')$$,
  'invalid_username',
  'username containing stack32 rejected'
);

select throws_ok(
  $$select public.set_username('stack32_bot')$$,
  'invalid_username',
  'stack32 prefix username rejected'
);

select lives_ok(
  $$select public.complete_onboarding(
    'googleSearch', 'founder', 'Del', null, null, null, null, null, null, null, null, 'del_user'
  )$$,
  'onboarding with clean username succeeds'
);

select is(
  (select (public.check_username_availability('foo_stack32')->>'reason')),
  'reserved',
  'availability marks embedded stack32 as reserved'
);

-- Build published + draft agents for deleter ------------------------------
reset role;
set local role service_role;

insert into public.workspaces (id, user_id, name)
values (
  '22222222-2222-2222-2222-222222222222',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'Del workspace'
);

insert into public.agents (id, user_id, workspace_id, name, slug, status)
values
(
  '33333333-3333-3333-3333-333333333333',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '22222222-2222-2222-2222-222222222222',
  'Published Agent',
  'published-agent',
  'published'
),
(
  '44444444-4444-4444-4444-444444444444',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '22222222-2222-2222-2222-222222222222',
  'Draft Agent',
  'draft-agent',
  'draft'
);

select is(
  (public.prepare_account_deletion('cccccccc-cccc-cccc-cccc-cccccccccccc')->>'transferredCount')::int,
  1,
  'prepare transfers exactly one published agent'
);

select is(
  (
    select a.user_id = (select id from public.profiles where username = 'stack32')
    from public.agents a
    where a.id = '33333333-3333-3333-3333-333333333333'
  ),
  true,
  'published agent now owned by @stack32'
);

select is(
  (select user_id from public.agents where id = '44444444-4444-4444-4444-444444444444'),
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  'draft agent remains on deleting user for cascade'
);

select * from finish();
rollback;
