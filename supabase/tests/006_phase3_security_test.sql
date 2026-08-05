-- Phase 3 security / schema tests (pgTAP)

begin;
select plan(18);

select has_table('public', 'agent_memories', 'agent_memories exists');
select has_table('public', 'agent_deployments', 'agent_deployments exists');
select has_table('public', 'security_audit_events', 'security_audit_events exists');
select has_table('public', 'run_queue', 'run_queue exists');
select has_table('public', 'rate_limit_buckets', 'rate_limit_buckets exists');
select has_table('public', 'agent_triggers', 'phase4 placeholder agent_triggers exists');
select has_table('public', 'agent_schedules', 'phase4 placeholder agent_schedules exists');
select has_table('public', 'external_connections', 'phase4 placeholder external_connections exists');

select has_function('public', 'consume_rate_limit', array['text', 'integer', 'integer']);
select has_function('public', 'user_monthly_usage_usd', array['uuid']);
select ok(
  exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'match_knowledge_chunks'),
  'match_knowledge_chunks exists'
);
select ok(
  exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'match_agent_memories'),
  'match_agent_memories exists'
);
select has_function('public', 'lease_run_queue_job', array['text', 'integer']);

select ok(
  exists(
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'agent_versions' and column_name = 'graph_spec'
  ),
  'agent_versions.graph_spec exists'
);
select ok(
  exists(
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'agent_versions' and column_name = 'schema_compat'
  ),
  'agent_versions.schema_compat exists'
);
select ok(
  exists(
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'knowledge_chunks' and column_name = 'embedding_dimension'
  ),
  'knowledge_chunks.embedding_dimension exists'
);

-- tool catalog still readable, Phase 4 tools disabled
select ok(
  (select count(*) > 0 from public.tool_catalog where id = 'web_search' and enabled),
  'web_search enabled'
);
select ok(
  (select count(*) > 0 from public.tool_catalog where id = 'custom_code' and not enabled),
  'custom_code seeded disabled'
);

select * from finish();
rollback;
