-- Persistent cache for Pipedream action/trigger component definitions (schema-driven UI).

create table if not exists public.pipedream_component_cache (
  component_key text not null,
  component_type text not null default 'action'
    check (component_type in ('action', 'trigger')),
  app_id text,
  version text,
  payload jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  primary key (component_key, component_type)
);

create index if not exists pipedream_component_cache_app_idx
  on public.pipedream_component_cache (app_id)
  where app_id is not null;

create index if not exists pipedream_component_cache_fetched_idx
  on public.pipedream_component_cache (fetched_at desc);

alter table public.pipedream_component_cache enable row level security;

create policy pipedream_component_cache_read on public.pipedream_component_cache
  for select using (true);

create policy pipedream_component_cache_no_client_write on public.pipedream_component_cache
  for insert with check (false);

comment on table public.pipedream_component_cache is
  'Cached Pipedream component payloads (configurable_props) to reduce API latency. Service-role writes only.';
