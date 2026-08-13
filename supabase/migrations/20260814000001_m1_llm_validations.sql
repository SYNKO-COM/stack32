-- M1 — freshness log for exact generated-agent LLM validation (BYOK).
-- Records the last validation outcome per (user, agent, provider, model) so the
-- readiness Brain check can require a recent successful validation. Service-role only.

create table if not exists public.llm_validations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid references public.agents (id) on delete cascade,
  provider text not null,
  model_id text not null,
  status text not null default 'unknown' check (
    status in ('valid', 'invalid_auth', 'model_not_found', 'insufficient_quota',
               'rate_limited', 'provider_error', 'network_error', 'unknown')
  ),
  error_code text,
  detail text,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists llm_validations_agent_checked_idx
  on public.llm_validations (agent_id, checked_at desc);

create index if not exists llm_validations_user_agent_idx
  on public.llm_validations (user_id, agent_id);

create unique index if not exists llm_validations_scope_unique
  on public.llm_validations (user_id, agent_id, provider, model_id)
  where agent_id is not null;

alter table public.llm_validations enable row level security;
-- No policies for authenticated/anon → service role only (Agent API).
revoke all on public.llm_validations from authenticated, anon;
grant all on public.llm_validations to service_role;
