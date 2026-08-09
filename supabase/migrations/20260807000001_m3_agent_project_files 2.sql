-- Milestone 3: virtual project files for Builder artifacts

create table if not exists public.agent_project_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  version_id uuid references public.agent_versions (id) on delete set null,
  path text not null,
  content text not null,
  content_type text not null default 'application/json',
  checksum text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, path)
);

create index if not exists agent_project_files_agent_idx
  on public.agent_project_files (agent_id, path);

alter table public.agent_project_files enable row level security;

create policy agent_project_files_select_own
  on public.agent_project_files for select
  using (auth.uid() = user_id);

create policy agent_project_files_no_client_write
  on public.agent_project_files for insert
  with check (false);

create policy agent_project_files_no_client_update
  on public.agent_project_files for update
  using (false);

create policy agent_project_files_no_client_delete
  on public.agent_project_files for delete
  using (false);
