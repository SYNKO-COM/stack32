-- Milestone 4: Google OAuth connections, bindings, approvals

create table if not exists public.user_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft', 'slack', 'notion')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'error', 'revoked', 'disabled')),
  account_email text,
  account_label text,
  scopes text[] not null default '{}',
  secret_ref text,
  refresh_secret_ref text,
  token_expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  last_validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, account_email)
);

create table if not exists public.oauth_connection_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  state text not null unique,
  code_verifier text not null,
  redirect_uri text not null,
  scopes text[] not null default '{}',
  agent_id uuid references public.agents (id) on delete set null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_connection_bindings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  connection_id uuid not null references public.user_connections (id) on delete cascade,
  tool_ids text[] not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (agent_id, connection_id)
);

create table if not exists public.agent_approval_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  run_id uuid references public.runs (id) on delete set null,
  thread_id uuid,
  tool_id text not null,
  action_summary text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'expired')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_connections_user_idx on public.user_connections (user_id, provider);
create index if not exists oauth_states_expires_idx on public.oauth_connection_states (expires_at);
create index if not exists agent_bindings_agent_idx on public.agent_connection_bindings (agent_id);
create index if not exists approval_requests_run_idx on public.agent_approval_requests (run_id, status);

alter table public.user_connections enable row level security;
alter table public.oauth_connection_states enable row level security;
alter table public.agent_connection_bindings enable row level security;
alter table public.agent_approval_requests enable row level security;

create policy user_connections_select_own on public.user_connections
  for select using (auth.uid() = user_id);
create policy user_connections_no_client_write on public.user_connections
  for insert with check (false);

create policy oauth_states_select_own on public.oauth_connection_states
  for select using (auth.uid() = user_id);
create policy oauth_states_no_client_write on public.oauth_connection_states
  for insert with check (false);

create policy bindings_select_own on public.agent_connection_bindings
  for select using (auth.uid() = user_id);
create policy bindings_no_client_write on public.agent_connection_bindings
  for insert with check (false);

create policy approvals_select_own on public.agent_approval_requests
  for select using (auth.uid() = user_id);
create policy approvals_no_client_write on public.agent_approval_requests
  for insert with check (false);

-- Keep Microsoft/Slack/Notion scaffolded disabled in catalog if present
update public.tool_catalog
set enabled = false
where id in ('slack', 'notion', 'microsoft_mail', 'microsoft_calendar');
