-- pgTAP: agent_installations table + helpers

begin;
select plan(8);

select has_table('public', 'agent_installations', 'agent_installations exists');

select has_column('public', 'agent_installations', 'status', 'status column');
select has_column('public', 'agent_connection_bindings', 'installation_id', 'bindings installation_id');
select has_column('public', 'user_secrets', 'installation_id', 'secrets installation_id');
select has_column('public', 'runs', 'installation_id', 'runs installation_id');
select has_column('public', 'live_threads', 'installation_id', 'live_threads installation_id');

select is(
  (select relrowsecurity from pg_class where relname = 'agent_installations'),
  true,
  'agent_installations RLS'
);

select has_function('private', 'owns_installation', array['uuid'], 'owns_installation helper');

select * from finish();
rollback;
