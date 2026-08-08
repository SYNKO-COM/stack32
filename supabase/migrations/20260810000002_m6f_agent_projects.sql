-- Milestone F: immutable agent project + snapshots.
-- A project is the code container for an agent; each successful build produces
-- an immutable snapshot with its own versioned file set. Forward-only: legacy
-- agent_project_files rows (snapshot_id null) remain valid.

create table if not exists public.agent_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  runtime_package text not null default 'stack32-agent-runtime',
  runtime_version text not null default '0.1.0',
  pattern text,
  current_snapshot_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id)
);

create table if not exists public.agent_project_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  project_id uuid not null references public.agent_projects (id) on delete cascade,
  version_id uuid references public.agent_versions (id) on delete set null,
  snapshot_number integer not null,
  sandbox_snapshot_id text,
  manifest jsonb not null default '{}'::jsonb,
  test_status text not null default 'not_run'
    check (test_status in ('not_run', 'passed', 'passed_with_warnings', 'failed')),
  lint_status text not null default 'not_run'
    check (lint_status in ('not_run', 'passed', 'failed')),
  files_count integer not null default 0,
  checksum text,
  created_at timestamptz not null default now(),
  unique (project_id, snapshot_number)
);

-- Deferred FK so current_snapshot_id can point at a snapshot.
alter table public.agent_projects
  drop constraint if exists agent_projects_current_snapshot_fk;
alter table public.agent_projects
  add constraint agent_projects_current_snapshot_fk
  foreign key (current_snapshot_id) references public.agent_project_snapshots (id) on delete set null;

-- Version project files by snapshot; end destructive per-(agent,path) upsert.
alter table public.agent_project_files
  add column if not exists snapshot_id uuid references public.agent_project_snapshots (id) on delete cascade;

-- Drop the old exclusive uniqueness so multiple snapshots can hold the same path.
alter table public.agent_project_files
  drop constraint if exists agent_project_files_agent_id_path_key;

create unique index if not exists agent_project_files_snapshot_path_uidx
  on public.agent_project_files (snapshot_id, path)
  where snapshot_id is not null;

create index if not exists agent_project_snapshots_agent_idx
  on public.agent_project_snapshots (agent_id, snapshot_number desc);
create index if not exists agent_project_files_snapshot_idx
  on public.agent_project_files (snapshot_id);

-- RLS: owner read; service-role writes only.
alter table public.agent_projects enable row level security;
alter table public.agent_project_snapshots enable row level security;

create policy agent_projects_select_own
  on public.agent_projects for select using (auth.uid() = user_id);
create policy agent_projects_no_client_write
  on public.agent_projects for insert with check (false);
create policy agent_projects_no_client_update
  on public.agent_projects for update using (false);

create policy agent_project_snapshots_select_own
  on public.agent_project_snapshots for select using (auth.uid() = user_id);
create policy agent_project_snapshots_no_client_write
  on public.agent_project_snapshots for insert with check (false);
create policy agent_project_snapshots_no_client_update
  on public.agent_project_snapshots for update using (false);

comment on table public.agent_project_snapshots is
  'Immutable code snapshots (M-F). Each successful build creates one; files reference snapshot_id.';
