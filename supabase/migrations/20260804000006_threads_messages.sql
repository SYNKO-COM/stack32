-- Stack32 Phase 2 — Builder & Live threads and messages.
-- Clients may insert their own *user* messages only. Assistant/system/tool
-- messages are inserted by trusted server code (server actions / service role).

-- ---------------------------------------------------------------------------
-- builder_threads
-- ---------------------------------------------------------------------------
create table public.builder_threads (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index builder_threads_agent_id_idx on public.builder_threads (agent_id);
create index builder_threads_user_id_idx on public.builder_threads (user_id);

create trigger set_builder_threads_updated_at
  before update on public.builder_threads
  for each row execute function public.set_updated_at();

create or replace function private.owns_builder_thread(thread_uuid uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.builder_threads t
    where t.id = thread_uuid
      and t.user_id = (select auth.uid())
      and private.owns_agent(t.agent_id)
  );
$$;

revoke all on function private.owns_builder_thread(uuid) from public, anon;
grant execute on function private.owns_builder_thread(uuid) to authenticated, service_role;

alter table public.builder_threads enable row level security;

create policy "builder_threads_select_own"
  on public.builder_threads for select
  to authenticated
  using ((select auth.uid()) = user_id and private.owns_agent(agent_id));

create policy "builder_threads_insert_own"
  on public.builder_threads for insert
  to authenticated
  with check ((select auth.uid()) = user_id and private.owns_agent(agent_id));

create policy "builder_threads_update_own"
  on public.builder_threads for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke delete on public.builder_threads from authenticated, anon;

-- ---------------------------------------------------------------------------
-- builder_messages
-- ---------------------------------------------------------------------------
create table public.builder_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.builder_threads (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  metadata jsonb not null default '{}',
  run_id uuid,
  created_at timestamptz not null default now()
);

create index builder_messages_thread_id_created_at_idx
  on public.builder_messages (thread_id, created_at);
create index builder_messages_agent_id_idx on public.builder_messages (agent_id);
create index builder_messages_user_id_idx on public.builder_messages (user_id);
create index builder_messages_run_id_idx on public.builder_messages (run_id);

alter table public.builder_messages enable row level security;

create policy "builder_messages_select_own_thread"
  on public.builder_messages for select
  to authenticated
  using (private.owns_builder_thread(thread_id));

-- Clients insert USER messages only; other roles come from trusted server code.
create policy "builder_messages_insert_user_role"
  on public.builder_messages for insert
  to authenticated
  with check (
    role = 'user'
    and (select auth.uid()) = user_id
    and private.owns_builder_thread(thread_id)
  );

revoke update, delete on public.builder_messages from authenticated, anon;

-- ---------------------------------------------------------------------------
-- live_threads
-- ---------------------------------------------------------------------------
create table public.live_threads (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index live_threads_agent_id_idx on public.live_threads (agent_id);
create index live_threads_user_id_idx on public.live_threads (user_id);

create trigger set_live_threads_updated_at
  before update on public.live_threads
  for each row execute function public.set_updated_at();

create or replace function private.owns_live_thread(thread_uuid uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.live_threads t
    where t.id = thread_uuid
      and t.user_id = (select auth.uid())
      and private.owns_agent(t.agent_id)
  );
$$;

revoke all on function private.owns_live_thread(uuid) from public, anon;
grant execute on function private.owns_live_thread(uuid) to authenticated, service_role;

alter table public.live_threads enable row level security;

create policy "live_threads_select_own"
  on public.live_threads for select
  to authenticated
  using ((select auth.uid()) = user_id and private.owns_agent(agent_id));

create policy "live_threads_insert_own"
  on public.live_threads for insert
  to authenticated
  with check ((select auth.uid()) = user_id and private.owns_agent(agent_id));

create policy "live_threads_update_own"
  on public.live_threads for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Clearing a Live conversation deletes the thread (messages cascade).
create policy "live_threads_delete_own"
  on public.live_threads for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- live_messages
-- ---------------------------------------------------------------------------
create table public.live_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.live_threads (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  artifacts jsonb not null default '[]',
  citations jsonb not null default '[]',
  metadata jsonb not null default '{}',
  run_id uuid,
  created_at timestamptz not null default now()
);

create index live_messages_thread_id_created_at_idx
  on public.live_messages (thread_id, created_at);
create index live_messages_agent_id_idx on public.live_messages (agent_id);
create index live_messages_user_id_idx on public.live_messages (user_id);
create index live_messages_run_id_idx on public.live_messages (run_id);

alter table public.live_messages enable row level security;

create policy "live_messages_select_own_thread"
  on public.live_messages for select
  to authenticated
  using (private.owns_live_thread(thread_id));

create policy "live_messages_insert_user_role"
  on public.live_messages for insert
  to authenticated
  with check (
    role = 'user'
    and (select auth.uid()) = user_id
    and private.owns_live_thread(thread_id)
  );

revoke update, delete on public.live_messages from authenticated, anon;
