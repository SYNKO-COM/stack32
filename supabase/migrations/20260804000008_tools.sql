-- Stack32 Phase 2 — tool catalog (metadata only) + per-agent bindings.
-- Tools do NOT execute anything in this phase.

create table public.tool_catalog (
  id text primary key,
  name text not null,
  description text not null,
  category text,
  input_schema jsonb not null default '{}',
  output_schema jsonb not null default '{}',
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high')),
  enabled boolean not null default true,
  is_internal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tool_catalog is
  'Global tool metadata. Execution is Phase 3+; rows here are placeholders.';

create trigger set_tool_catalog_updated_at
  before update on public.tool_catalog
  for each row execute function public.set_updated_at();

alter table public.tool_catalog enable row level security;

create policy "tool_catalog_select_public_enabled"
  on public.tool_catalog for select
  to authenticated
  using (enabled and not is_internal);

revoke insert, update, delete on public.tool_catalog from authenticated, anon;

-- Seeded in a migration (not seed.sql) so hosted deployments get the catalog.
insert into public.tool_catalog (id, name, description, category) values
  ('web_search', 'Web search', 'Search the public web for fresh information.', 'research'),
  ('fetch_url', 'Fetch URL', 'Fetch and read the content of a public web page.', 'research'),
  ('knowledge_search', 'Knowledge search', 'Search the agent''s own knowledge base.', 'knowledge'),
  ('calculator', 'Calculator', 'Evaluate mathematical expressions.', 'utility'),
  ('current_datetime', 'Current date & time', 'Return the current date and time.', 'utility'),
  ('structured_output', 'Structured output', 'Produce structured (tabular/JSON) answers.', 'output')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- agent_tool_bindings
-- ---------------------------------------------------------------------------
create table public.agent_tool_bindings (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  agent_version_id uuid references public.agent_versions (id) on delete cascade,
  tool_id text not null references public.tool_catalog (id) on delete cascade,
  config jsonb not null default '{}',
  approval_mode text not null default 'never' check (
    approval_mode in ('never', 'always', 'conditional')
  ),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index agent_tool_bindings_agent_id_idx on public.agent_tool_bindings (agent_id);
create index agent_tool_bindings_tool_id_idx on public.agent_tool_bindings (tool_id);
create index agent_tool_bindings_agent_version_id_idx
  on public.agent_tool_bindings (agent_version_id);

create trigger set_agent_tool_bindings_updated_at
  before update on public.agent_tool_bindings
  for each row execute function public.set_updated_at();

alter table public.agent_tool_bindings enable row level security;

create policy "agent_tool_bindings_select_owned_agent"
  on public.agent_tool_bindings for select
  to authenticated
  using (private.owns_agent(agent_id));

create policy "agent_tool_bindings_insert_owned_agent"
  on public.agent_tool_bindings for insert
  to authenticated
  with check (private.owns_agent(agent_id));

create policy "agent_tool_bindings_update_owned_agent"
  on public.agent_tool_bindings for update
  to authenticated
  using (private.owns_agent(agent_id))
  with check (private.owns_agent(agent_id));

create policy "agent_tool_bindings_delete_owned_agent"
  on public.agent_tool_bindings for delete
  to authenticated
  using (private.owns_agent(agent_id));
