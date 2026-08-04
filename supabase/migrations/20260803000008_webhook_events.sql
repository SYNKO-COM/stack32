-- Stack32 — Webhook events (billing provider callbacks, e.g. Whop)
-- Raw event log used for idempotent webhook processing.
--
-- SECURITY: RLS is enabled but NO policies are defined on purpose.
-- With RLS on and zero policies, anon/authenticated clients can neither read
-- nor write. Only the service role (which bypasses RLS) may access this table
-- from server-side webhook handlers.

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'whop',
  event_id text,
  event_type text,
  payload jsonb not null,
  processed_at timestamptz, -- null until the event has been handled
  created_at timestamptz not null default now(),
  unique (provider, event_id) -- idempotency: same provider event stored once
);

create index webhook_events_event_type_idx on public.webhook_events (event_type);

alter table public.webhook_events enable row level security;
-- Intentionally no policies: service-role only.
