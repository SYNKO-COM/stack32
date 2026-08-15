-- Platform learning: proven Pipedream tool config shapes (no user PII values).

create table if not exists public.tool_config_playbooks (
  id uuid primary key default gen_random_uuid(),
  signature text not null,
  tool_id text not null,
  action_id text not null,
  app_id text,
  config_shape jsonb not null default '{}'::jsonb,
  notes text not null default '',
  times_succeeded integer not null default 0 check (times_succeeded >= 0),
  times_failed integer not null default 0 check (times_failed >= 0),
  status text not null default 'candidate'
    check (status in ('candidate', 'stable', 'deprecated')),
  last_succeeded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (signature)
);

create index if not exists tool_config_playbooks_action_idx
  on public.tool_config_playbooks (action_id, times_succeeded desc);
create index if not exists tool_config_playbooks_app_idx
  on public.tool_config_playbooks (app_id)
  where app_id is not null;
create index if not exists tool_config_playbooks_tool_idx
  on public.tool_config_playbooks (tool_id);

comment on table public.tool_config_playbooks is
  'Aggregated successful Pipedream tool config shapes — platform-wide, sanitized (no secrets/PII values). Service-role only.';

alter table public.tool_config_playbooks enable row level security;

create policy tool_config_playbooks_no_client_select
  on public.tool_config_playbooks for select using (false);
create policy tool_config_playbooks_no_client_insert
  on public.tool_config_playbooks for insert with check (false);
create policy tool_config_playbooks_no_client_update
  on public.tool_config_playbooks for update using (false);
create policy tool_config_playbooks_no_client_delete
  on public.tool_config_playbooks for delete using (false);

create trigger set_tool_config_playbooks_updated_at
  before update on public.tool_config_playbooks
  for each row execute function public.set_updated_at();
