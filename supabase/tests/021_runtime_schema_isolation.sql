-- Nothing reachable through the API may sit outside the RLS regime.
--
-- Written after finding all four LangGraph checkpoint tables in `public` with
-- RLS off and the Supabase default grants: anon could SELECT full run state,
-- and any signed-in user could UPDATE, DELETE or TRUNCATE it. M9 had provisioned
-- `agent_runtime` for exactly this reason but never moved the tables that
-- already existed, and nothing failed when the isolation silently did not hold.
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

-- 1. Every table in the API-exposed schema is under RLS. A table with RLS on and
--    no policies is fine — that denies everyone except the bypassrls roles.
select is_empty(
  $$select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and not c.relrowsecurity$$,
  'no table in public escapes row level security'
);

-- 2. The checkpoint tables belong to the runtime schema, not the exposed one.
select is_empty(
  $$select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname like 'checkpoint%'$$,
  'LangGraph checkpoint tables never live in public'
);

-- 3. The runtime schema is reachable only by the roles backing the service.
--    Without USAGE, anon and authenticated cannot touch anything inside it
--    whatever the per-table grants happen to say.
select ok(
  not has_schema_privilege('anon', 'agent_runtime', 'usage'),
  'anon has no usage on agent_runtime'
);

select ok(
  not has_schema_privilege('authenticated', 'agent_runtime', 'usage'),
  'authenticated has no usage on agent_runtime'
);

select * from finish();
rollback;
