-- Milestone A: isolated coding sandbox workspaces.
-- Tracks each Builder run's sandbox so a browser disconnect never orphans or
-- destroys an in-flight build. Provider-neutral (local dev / e2b prod).

create table if not exists public.builder_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  run_id uuid references public.runs (id) on delete set null,
  provider text not null check (provider in ('local', 'e2b', 'daytona')),
  provider_workspace_id text not null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'destroyed', 'error')),
  snapshot_id text,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists builder_workspaces_run_idx
  on public.builder_workspaces (run_id);
create index if not exists builder_workspaces_agent_idx
  on public.builder_workspaces (agent_id, status);

alter table public.builder_workspaces enable row level security;

-- Owner may read their workspace metadata; all writes go through service role.
create policy builder_workspaces_select_own
  on public.builder_workspaces for select
  using (auth.uid() = user_id);

create policy builder_workspaces_no_client_insert
  on public.builder_workspaces for insert
  with check (false);

create policy builder_workspaces_no_client_update
  on public.builder_workspaces for update
  using (false);

create policy builder_workspaces_no_client_delete
  on public.builder_workspaces for delete
  using (false);

comment on table public.builder_workspaces is
  'Isolated Builder coding sandboxes (M-A). provider_workspace_id references the E2B/local backend workspace.';
