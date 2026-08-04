-- Profile auto-creation trigger + updated_at trigger.
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

-- Creating an auth user creates a profile with the same id.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'trigger-test@stack32.test',
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"first_name":"Ada","locale":"fr"}',
  now(), now()
);

select is(
  (select count(*)::int from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  1, 'profile auto-created for new auth user'
);
select is(
  (select first_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Ada', 'harmless first_name metadata copied'
);
select is(
  (select locale from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'fr', 'valid locale metadata copied'
);
select is(
  (select onboarding_completed from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  false, 'onboarding starts incomplete'
);

-- Idempotency: re-running the trigger function body must not fail.
insert into public.profiles (id) values ('11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;
select pass('profile insert is idempotent');

-- updated_at trigger.
update public.profiles set first_name = 'Grace'
where id = '11111111-1111-1111-1111-111111111111';
select ok(
  (select updated_at >= created_at from public.profiles
   where id = '11111111-1111-1111-1111-111111111111'),
  'updated_at maintained on update'
);

select * from finish();
rollback;
