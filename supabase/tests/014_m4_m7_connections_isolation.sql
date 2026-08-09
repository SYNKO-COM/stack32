-- pgTAP: M4/M7 connection + binding isolation (User A ≠ User B)
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'authenticated', 'authenticated', 'conn-a@stack32.test',
   extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'authenticated', 'authenticated', 'conn-b@stack32.test',
   extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

-- User A creates an agent workspace.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select lives_ok(
  $$select public.create_agent_workspace('Conn Agent A', 'prompt A')$$,
  'user A workspace'
);

-- Capture agent id in a session variable (avoid temp-table role issues).
select set_config(
  'test.agent_a_id',
  (select id::text from public.agents
   where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   limit 1),
  true
);

-- Service role seeds connection data for user A.
set local role service_role;
select set_config('request.jwt.claims', '', true);

insert into public.user_connections (id, user_id, provider, status, account_email, scopes)
values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'google',
  'active',
  'a@example.com',
  array['https://www.googleapis.com/auth/gmail.readonly']
);

insert into public.agent_connection_bindings (user_id, agent_id, connection_id, tool_ids)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  current_setting('test.agent_a_id')::uuid,
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  array['gmail_list', 'gmail_read']
);

insert into public.agent_approval_requests (user_id, agent_id, tool_id, action_summary, status)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  current_setting('test.agent_a_id')::uuid,
  'gmail_send_message',
  'Send email',
  'pending'
);

-- User A can see own connection + binding + approval.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.user_connections where provider = 'google'),
  1,
  'A sees own google connection'
);
select is(
  (select count(*)::int from public.agent_connection_bindings),
  1,
  'A sees own binding'
);
select is(
  (select count(*)::int from public.agent_approval_requests),
  1,
  'A sees own approval'
);

-- User B sees none of A's connection data.
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.user_connections),
  0,
  'B cannot see A connections'
);
select is(
  (select count(*)::int from public.agent_connection_bindings),
  0,
  'B cannot see A bindings'
);
select is(
  (select count(*)::int from public.agent_approval_requests),
  0,
  'B cannot see A approvals'
);

-- Client writes denied for B.
select throws_ok(
  $$insert into public.user_connections (user_id, provider, status, account_email)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'google', 'active', 'b@example.com')$$,
  '42501',
  null,
  'B cannot insert user_connections'
);

-- Catalog hybrid columns present + readable.
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tool_definitions'
      and column_name = 'provider_tool_id'
  ),
  'tool_definitions.provider_tool_id exists'
);

select ok(
  (select count(*)::int from public.tool_definitions where id = 'gmail_send_message') = 1,
  'gmail_send_message seeded'
);

select * from finish();
rollback;
