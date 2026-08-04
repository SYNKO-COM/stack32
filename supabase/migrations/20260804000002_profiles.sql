-- Stack32 Phase 2 — profiles.
-- One row per auth user, auto-created by the handle_new_user trigger.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  full_name text,
  avatar_url text,
  phone text,
  locale text not null default 'en',
  timezone text,
  onboarding_completed boolean not null default false,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Application profile mirroring auth.users. onboarding_completed is only set through the complete_onboarding RPC.';

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No INSERT/DELETE policies: rows are created by the trigger below and removed
-- by the auth.users cascade. Column-level privileges prevent users from
-- setting privileged fields (onboarding_completed*) directly.
revoke insert, delete on public.profiles from authenticated, anon;
revoke update on public.profiles from authenticated, anon;
grant select on public.profiles to authenticated;
grant update (first_name, full_name, avatar_url, phone, locale, timezone)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Auto-create a profile whenever a new auth user signs up.
-- SECURITY DEFINER + fixed search_path; idempotent via ON CONFLICT.
-- Only harmless metadata (first name, avatar) is copied; user-editable
-- metadata is never used as an authorization source.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, full_name, avatar_url, locale)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name',
                         new.raw_user_meta_data ->> 'name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'avatar_url', '')), ''),
    case
      when new.raw_user_meta_data ->> 'locale' in ('en', 'fr')
        then new.raw_user_meta_data ->> 'locale'
      else 'en'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: safe no-op on a fresh project, creates missing profiles otherwise.
insert into public.profiles (id)
select u.id from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
