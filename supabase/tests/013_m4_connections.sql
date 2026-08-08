-- pgTAP M4 connection tables

begin;
select plan(5);

select has_table('public', 'user_connections', 'user_connections');
select has_table('public', 'oauth_connection_states', 'oauth_connection_states');
select has_table('public', 'agent_connection_bindings', 'agent_connection_bindings');
select has_table('public', 'agent_approval_requests', 'agent_approval_requests');
select is(
  (select relrowsecurity from pg_class where relname = 'user_connections'),
  true,
  'user_connections RLS'
);

select * from finish();
rollback;
