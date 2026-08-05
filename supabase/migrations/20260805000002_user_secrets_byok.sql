-- Phase 3.1 — encrypted user secrets (BYOK). Ciphertext is service-role only.

create table if not exists public.user_secrets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid references public.agents (id) on delete cascade,
  provider text not null check (
    provider in ('openai', 'xai', 'anthropic', 'gemini', 'openrouter', 'custom')
  ),
  secret_kind text not null default 'llm_api_key' check (
    secret_kind in ('llm_api_key', 'search_api_key', 'webhook_secret', 'other')
  ),
  ciphertext text not null,
  key_hint text not null default '',
  label text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_secrets_agent_provider_unique
  on public.user_secrets (user_id, agent_id, provider, secret_kind)
  where agent_id is not null;

create unique index if not exists user_secrets_user_default_unique
  on public.user_secrets (user_id, provider, secret_kind)
  where agent_id is null;

create index if not exists user_secrets_user_agent_idx
  on public.user_secrets (user_id, agent_id);

create trigger set_user_secrets_updated_at
  before update on public.user_secrets
  for each row execute function public.set_updated_at();

alter table public.user_secrets enable row level security;
-- No policies for authenticated/anon → service role only (Agent API).
revoke all on public.user_secrets from authenticated, anon;
grant all on public.user_secrets to service_role;

alter table public.agents
  add column if not exists first_ready_at timestamptz,
  add column if not exists first_ready_celebrated boolean not null default false;
