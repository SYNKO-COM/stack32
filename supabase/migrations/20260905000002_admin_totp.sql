-- Stack32 — two-factor secret storage for the internal admin console.
--
-- The console has a single operator account that is not a Supabase user, so
-- its TOTP secret lives here rather than in auth.users. Service role only:
-- RLS is on with no policies and every grant to app roles is revoked.

create table public.admin_totp (
  email text primary key,
  secret text not null,
  -- Highest TOTP step already accepted, so a code cannot be replayed inside
  -- its own validity window.
  last_used_step bigint,
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger admin_totp_set_updated_at
  before update on public.admin_totp
  for each row execute function public.set_updated_at();

alter table public.admin_totp enable row level security;
revoke all on public.admin_totp from authenticated, anon;
