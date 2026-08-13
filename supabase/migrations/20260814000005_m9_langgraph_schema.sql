-- M9: Isolate LangGraph checkpoint tables in a dedicated schema.
--
-- The generated-agent runtime uses LangGraph's Postgres checkpointer, whose
-- setup() creates checkpoints / checkpoint_blobs / checkpoint_writes /
-- checkpoint_migrations at runtime. Previously these landed in `public`, which
-- made `supabase gen types --schema public` non-reproducible from migrations
-- (CI diff failures). The runtime now forces `search_path=agent_runtime,public`
-- for the checkpointer connection so those tables are created here instead.
--
-- This migration only provisions the schema + privileges; the tables themselves
-- remain runtime-managed by LangGraph (idempotent setup()).

create schema if not exists agent_runtime;

-- The agent-service connects via DATABASE_URL. Grant the roles that may back
-- that connection so setup() can create and use its tables.
grant usage, create on schema agent_runtime to postgres, service_role;

-- Keep the runtime schema outside the API-exposed schemas; no RLS/policies are
-- needed because it is never reachable through PostgREST (see config.toml
-- api.schemas = public, storage, graphql_public).
