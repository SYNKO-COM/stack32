-- Stack32 Phase 2 — usage_events (read own / server writes) and
-- webhook_events (fully server-only).

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid references public.agents (id) on delete cascade,
  run_id uuid references public.runs (id) on delete set null,
  event_name text not null,
  quantity numeric not null default 1,
  unit text,
  estimated_cost numeric,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index usage_events_user_id_created_at_idx
  on public.usage_events (user_id, created_at desc);
create index usage_events_agent_id_idx on public.usage_events (agent_id);
create index usage_events_run_id_idx on public.usage_events (run_id);

alter table public.usage_events enable row level security;

create policy "usage_events_select_own"
  on public.usage_events for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Users must not forge usage rows from the browser.
revoke insert, update, delete on public.usage_events from authenticated, anon;

-- ---------------------------------------------------------------------------
-- webhook_events — idempotent provider webhook persistence. Server-only.
-- ---------------------------------------------------------------------------
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'processed', 'failed', 'skipped')
  ),
  attempt_count integer not null default 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webhook_events_provider_event_key unique (provider, provider_event_id)
);

create index webhook_events_status_idx on public.webhook_events (status);

create trigger set_webhook_events_updated_at
  before update on public.webhook_events
  for each row execute function public.set_updated_at();

alter table public.webhook_events enable row level security;

-- No policies at all: only the service role (bypasses RLS) can touch this table.
revoke all on public.webhook_events from authenticated, anon;
