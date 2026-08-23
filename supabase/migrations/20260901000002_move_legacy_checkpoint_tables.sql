-- Finish what M9 started: move the legacy checkpoint tables out of `public`.
--
-- M9 (20260814000005) provisioned `agent_runtime` and pointed the checkpointer's
-- search_path at it, but it never moved the tables that already existed in
-- `public`. Because the search_path is `agent_runtime,public`, LangGraph's
-- idempotent setup() kept finding the old tables and kept writing to them, so
-- the isolation never actually happened.
--
-- That left full run state — every message, tool argument and tool result — in
-- an API-exposed schema. `public` grants USAGE to anon and authenticated, these
-- tables carry the Supabase default table grants, and they have no RLS: anon
-- could read them and any signed-in user could UPDATE, DELETE or TRUNCATE them.
--
-- `agent_runtime` grants USAGE to postgres and service_role only, and is not in
-- config.toml's api.schemas, so moving the tables closes the hole at the schema
-- level rather than relying on per-table grants.
--
-- The agent-service connects as a role with rolbypassrls, so nothing it does
-- changes; ALTER TABLE ... SET SCHEMA carries the indexes and the rows along.

do $$
declare
  t text;
begin
  foreach t in array array[
    'checkpoints', 'checkpoint_blobs', 'checkpoint_writes', 'checkpoint_migrations'
  ] loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;

    if to_regclass(format('agent_runtime.%I', t)) is null then
      execute format('alter table public.%I set schema agent_runtime', t);
      raise notice 'moved public.% to agent_runtime', t;
    else
      -- Both copies exist: the runtime is already on the agent_runtime one, so
      -- the public copy is stale. Leave the rows in place rather than dropping
      -- data a human has not looked at, but take it off the exposed surface.
      execute format('revoke all on public.%I from anon, authenticated', t);
      execute format('alter table public.%I enable row level security', t);
      raise warning 'stale public.% left behind; access revoked', t;
    end if;
  end loop;
end $$;
