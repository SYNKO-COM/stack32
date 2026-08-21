-- Tool / Pipedream event triggers: runtime rows + idempotent deliveries.

alter table public.agent_triggers
  add column if not exists installation_id uuid references public.agent_installations (id) on delete set null,
  add column if not exists component_id text,
  add column if not exists app_id text,
  add column if not exists deployed_source_id text,
  add column if not exists webhook_signing_key text,
  add column if not exists mode text not null default 'listen',
  add column if not exists status text not null default 'idle',
  add column if not exists listening_until timestamptz,
  add column if not exists last_event_at timestamptz,
  add column if not exists last_error text;

alter table public.agent_triggers drop constraint if exists agent_triggers_mode_check;
alter table public.agent_triggers
  add constraint agent_triggers_mode_check
  check (mode in ('listen', 'persistent'));

alter table public.agent_triggers drop constraint if exists agent_triggers_status_check;
alter table public.agent_triggers
  add constraint agent_triggers_status_check
  check (status in ('idle', 'listening', 'active', 'disabled', 'error'));

create index if not exists agent_triggers_agent_id_idx
  on public.agent_triggers (agent_id);

create index if not exists agent_triggers_deployed_source_idx
  on public.agent_triggers (deployed_source_id)
  where deployed_source_id is not null;

create unique index if not exists agent_triggers_user_agent_component_key
  on public.agent_triggers (user_id, agent_id, component_id)
  where component_id is not null;

create table if not exists public.agent_trigger_events (
  id uuid primary key default gen_random_uuid(),
  trigger_id uuid not null references public.agent_triggers (id) on delete cascade,
  provider_event_id text not null,
  run_id uuid references public.runs (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  constraint agent_trigger_events_dedupe unique (trigger_id, provider_event_id)
);

create index if not exists agent_trigger_events_trigger_id_idx
  on public.agent_trigger_events (trigger_id, received_at desc);

alter table public.agent_trigger_events enable row level security;

revoke all on public.agent_trigger_events from public, anon, authenticated;

comment on table public.agent_trigger_events is
  'Idempotent Pipedream trigger deliveries. Server-only writes.';
