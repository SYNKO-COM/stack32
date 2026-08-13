-- pgTAP: agent_tool_configurations owner isolation (User A ≠ User B)
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'authenticated', 'authenticated', 'toolcfg-a@stack32.test',
   extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'authenticated', 'authenticated', 'toolcfg-b@stack32.test',
   extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select lives_ok(
  $$select public.create_agent_workspace('ToolCfg Agent A', 'prompt A')$$,
  'user A workspace'
);

select set_config(
  'test.agent_a_id',
  (select id::text from public.agents
   where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   order by created_at desc limit 1),
  true
);

set local role service_role;
select set_config('request.jwt.claims', '', true);

insert into public.agent_tool_configurations (
  user_id, agent_id, tool_id, provider, provider_action_id, config, status
) values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  current_setting('test.agent_a_id')::uuid,
  'pd:slack-send-message-to-channel',
  'pipedream',
  'slack-send-message-to-channel',
  '{"channel":"C123"}'::jsonb,
  'active'
);

-- User A can read own config
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.agent_tool_configurations),
  1,
  'A sees own tool config'
);

-- User A cannot insert via client RLS
select throws_ok(
  $$insert into public.agent_tool_configurations
    (user_id, agent_id, tool_id, provider, config)
   values (
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     current_setting('test.agent_a_id')::uuid,
     'pd:other',
     'pipedream',
     '{}'::jsonb
   )$$,
  '42501',
  null,
  'client insert denied'
);

-- User B sees nothing
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.agent_tool_configurations),
  0,
  'B cannot see A tool config'
);

select is(
  (select count(*)::int from public.agent_tool_configurations
    where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'B cannot filter A rows'
);

-- Service role can write
set local role service_role;
select set_config('request.jwt.claims', '', true);
select lives_ok(
  $$update public.agent_tool_configurations
    set config = '{"channel":"C999"}'::jsonb
    where tool_id = 'pd:slack-send-message-to-channel'$$,
  'service role can update'
);

select * from finish();
rollback;
