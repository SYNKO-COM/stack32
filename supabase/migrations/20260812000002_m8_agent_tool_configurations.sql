-- M8: per-agent tool configuration (static props) for hybrid integrations.

create table if not exists public.agent_tool_configurations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  tool_id text not null,
  connection_id uuid references public.user_connections (id) on delete set null,
  provider text not null default 'pipedream'
    check (provider ~ '^[a-z][a-z0-9_]{1,62}$'),
  provider_action_id text,
  config jsonb not null default '{}'::jsonb,
  schema_version text,
  status text not null default 'active'
    check (status in ('active', 'needs_config', 'invalid', 'disabled')),
  last_validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, tool_id)
);

create index if not exists agent_tool_configurations_user_idx
  on public.agent_tool_configurations (user_id);
create index if not exists agent_tool_configurations_agent_idx
  on public.agent_tool_configurations (agent_id);
create index if not exists agent_tool_configurations_connection_idx
  on public.agent_tool_configurations (connection_id)
  where connection_id is not null;

alter table public.agent_tool_configurations enable row level security;

create policy agent_tool_configurations_select_own on public.agent_tool_configurations
  for select using (auth.uid() = user_id);

-- Writes go through the service role (agent-service); deny client mutations.
create policy agent_tool_configurations_no_client_insert on public.agent_tool_configurations
  for insert with check (false);
create policy agent_tool_configurations_no_client_update on public.agent_tool_configurations
  for update using (false);
create policy agent_tool_configurations_no_client_delete on public.agent_tool_configurations
  for delete using (false);

comment on table public.agent_tool_configurations is
  'Per-agent static configuration for tools (channel, calendar, sheet, …). Credentials live in user_connections / Pipedream.';
