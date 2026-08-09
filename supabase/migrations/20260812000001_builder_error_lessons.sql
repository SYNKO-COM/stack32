-- Platform learning memory: errors Stack32 fixed, reused to improve Builder repairs.

create table if not exists public.builder_error_lessons (
  id uuid primary key default gen_random_uuid(),
  error_signature text not null,
  error_code text,
  reason text not null default '',
  context jsonb not null default '{}'::jsonb,
  resolution jsonb not null default '{}'::jsonb,
  resolution_summary text not null default '',
  times_seen integer not null default 1 check (times_seen >= 1),
  times_helped integer not null default 0 check (times_helped >= 0),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (error_signature)
);

create index if not exists builder_error_lessons_seen_idx
  on public.builder_error_lessons (last_seen_at desc);
create index if not exists builder_error_lessons_code_idx
  on public.builder_error_lessons (error_code)
  where error_code is not null;

comment on table public.builder_error_lessons is
  'Aggregated Builder/repair lessons — platform-wide, no user PII. Service-role only.';

alter table public.builder_error_lessons enable row level security;

-- No authenticated policies: service role bypasses RLS; clients cannot read/write.
create policy builder_error_lessons_no_client_select
  on public.builder_error_lessons for select using (false);
create policy builder_error_lessons_no_client_insert
  on public.builder_error_lessons for insert with check (false);
create policy builder_error_lessons_no_client_update
  on public.builder_error_lessons for update using (false);
create policy builder_error_lessons_no_client_delete
  on public.builder_error_lessons for delete using (false);

create trigger set_builder_error_lessons_updated_at
  before update on public.builder_error_lessons
  for each row execute function public.set_updated_at();
