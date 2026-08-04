-- Stack32 — Profiles & onboarding
-- One profile row per auth user, auto-created by the handle_new_user trigger.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  phone text,
  locale text not null default 'en',
  onboarding_completed boolean not null default false,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can delete own profile"
  on public.profiles for delete
  using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
-- SECURITY DEFINER so it can insert regardless of the caller's RLS context.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- onboarding_responses
-- ---------------------------------------------------------------------------
create table public.onboarding_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  discovery_source text,
  role text,
  primary_use_case text,
  created_at timestamptz not null default now()
);

create index onboarding_responses_user_id_idx
  on public.onboarding_responses (user_id);

alter table public.onboarding_responses enable row level security;

create policy "Users can view own onboarding responses"
  on public.onboarding_responses for select
  using (auth.uid() = user_id);

create policy "Users can insert own onboarding responses"
  on public.onboarding_responses for insert
  with check (auth.uid() = user_id);

create policy "Users can update own onboarding responses"
  on public.onboarding_responses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own onboarding responses"
  on public.onboarding_responses for delete
  using (auth.uid() = user_id);
