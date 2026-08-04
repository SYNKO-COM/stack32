-- Schema smoke tests: tables exist and RLS is enabled everywhere.
begin;
create extension if not exists pgtap with schema extensions;

select plan(43);

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'onboarding_responses', 'onboarding_responses exists');
select has_table('public', 'subscriptions', 'subscriptions exists');
select has_table('public', 'agents', 'agents exists');
select has_table('public', 'agent_versions', 'agent_versions exists');
select has_table('public', 'builder_threads', 'builder_threads exists');
select has_table('public', 'builder_messages', 'builder_messages exists');
select has_table('public', 'live_threads', 'live_threads exists');
select has_table('public', 'live_messages', 'live_messages exists');
select has_table('public', 'runs', 'runs exists');
select has_table('public', 'run_events', 'run_events exists');
select has_table('public', 'tool_catalog', 'tool_catalog exists');
select has_table('public', 'agent_tool_bindings', 'agent_tool_bindings exists');
select has_table('public', 'knowledge_sources', 'knowledge_sources exists');
select has_table('public', 'knowledge_chunks', 'knowledge_chunks exists');
select has_table('public', 'agent_tests', 'agent_tests exists');
select has_table('public', 'attachments', 'attachments exists');
select has_table('public', 'artifacts', 'artifacts exists');
select has_table('public', 'usage_events', 'usage_events exists');
select has_table('public', 'webhook_events', 'webhook_events exists');

-- RLS enabled on every application table.
select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = t.name),
  'RLS enabled on ' || t.name
)
from (values
  ('profiles'), ('onboarding_responses'), ('subscriptions'), ('agents'),
  ('agent_versions'), ('builder_threads'), ('builder_messages'), ('live_threads'),
  ('live_messages'), ('runs'), ('run_events'), ('tool_catalog'),
  ('agent_tool_bindings'), ('knowledge_sources'), ('knowledge_chunks'),
  ('agent_tests'), ('attachments'), ('artifacts'), ('usage_events'), ('webhook_events')
) as t(name);

-- Tool catalog seed + key functions present.
select is(
  (select count(*)::int from public.tool_catalog),
  6,
  'tool_catalog seeded with 6 placeholder tools'
);
select has_function('public', 'complete_onboarding', 'complete_onboarding RPC exists');
select has_function('public', 'create_agent_workspace', 'create_agent_workspace RPC exists');

select * from finish();
rollback;
