-- Stack32 — Runs & run events
-- A run is one execution of the pipeline (build, live answer, test, repair,
-- knowledge ingestion). run_events is the append-only event log of a run.

-- ---------------------------------------------------------------------------
-- runs
-- ---------------------------------------------------------------------------
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text check (kind in ('build', 'live', 'test', 'repair', 'ingestion')),
  status text default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  started_at timestamptz,
  finished_at timestamptz,
  cost_usd numeric,
  error text,
  created_at timestamptz not null default now()
);

create index runs_agent_id_idx on public.runs (agent_id);
create index runs_user_id_idx on public.runs (user_id);

alter table public.runs enable row level security;

create policy "Users can view own runs"
  on public.runs for select
  using (auth.uid() = user_id);

create policy "Users can insert own runs"
  on public.runs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own runs"
  on public.runs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own runs"
  on public.runs for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- run_events
-- ---------------------------------------------------------------------------
create table public.run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  payload jsonb default '{}',
  created_at timestamptz not null default now()
);

create index run_events_run_id_created_at_idx
  on public.run_events (run_id, created_at);

alter table public.run_events enable row level security;

create policy "Users can view own run events"
  on public.run_events for select
  using (auth.uid() = user_id);

create policy "Users can insert own run events"
  on public.run_events for insert
  with check (auth.uid() = user_id);

create policy "Users can update own run events"
  on public.run_events for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own run events"
  on public.run_events for delete
  using (auth.uid() = user_id);
