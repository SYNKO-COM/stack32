-- Stack32 — Subscriptions (billing state mirrored from the provider, e.g. Whop)
-- Rows are written by server-side webhook handlers (service role);
-- clients only need read access to their own subscription.

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'whop',
  provider_subscription_id text,
  plan_id text,
  status text not null default 'inactive'
    check (status in ('active', 'trialing', 'past_due', 'canceled', 'expired', 'inactive')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

-- No extra index on user_id: the unique (user_id, provider) constraint
-- already provides a usable index prefix.

create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

-- Read-only for the owner; writes happen through the service role
-- (webhook handlers), which bypasses RLS.
create policy "Users can view own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);
