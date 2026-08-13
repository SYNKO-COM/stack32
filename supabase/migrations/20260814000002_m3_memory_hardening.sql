-- M3 — memory hardening: retention/prune indexes + external memory provider config.

-- Speeds up rolling prune (order by created_at desc per agent) and expiry cleanup.
create index if not exists agent_memories_agent_created_idx
  on public.agent_memories (agent_id, created_at desc);

create index if not exists agent_memories_expires_at_idx
  on public.agent_memories (expires_at)
  where expires_at is not null;

-- Encrypted external memory (BYO Postgres/Supabase) configuration. The connection
-- string is stored as a service-role-only encrypted reference; never exposed to clients.
create table if not exists public.external_memory_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  db_type text not null default 'postgres' check (db_type in ('postgres', 'supabase')),
  encrypted_conn_ref text not null,
  namespace text not null default 'stack32_memory',
  status text not null default 'pending' check (
    status in ('pending', 'validated', 'invalid', 'error')
  ),
  detail text,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists external_memory_configs_agent_unique
  on public.external_memory_configs (agent_id);

create index if not exists external_memory_configs_user_idx
  on public.external_memory_configs (user_id);

create trigger set_external_memory_configs_updated_at
  before update on public.external_memory_configs
  for each row execute function public.set_updated_at();

alter table public.external_memory_configs enable row level security;
-- Service role only (Agent API); ciphertext never reaches authenticated/anon.
revoke all on public.external_memory_configs from authenticated, anon;
grant all on public.external_memory_configs to service_role;
