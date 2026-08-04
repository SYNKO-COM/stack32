-- Stack32 — Conversation threads & messages
-- builder_* : the chat where the user designs an agent with the builder AI.
-- live_*    : conversations with a published/running agent.

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

alter table public.builder_threads enable row level security;

create policy "Users can view own builder threads"
  on public.builder_threads for select
  using (auth.uid() = user_id);

create policy "Users can insert own builder threads"
  on public.builder_threads for insert
  with check (auth.uid() = user_id);

create policy "Users can update own builder threads"
  on public.builder_threads for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own builder threads"
  on public.builder_threads for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- builder_messages
-- ---------------------------------------------------------------------------
create table public.builder_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.builder_threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index builder_messages_thread_id_created_at_idx
  on public.builder_messages (thread_id, created_at);

alter table public.builder_messages enable row level security;

create policy "Users can view own builder messages"
  on public.builder_messages for select
  using (auth.uid() = user_id);

create policy "Users can insert own builder messages"
  on public.builder_messages for insert
  with check (auth.uid() = user_id);

create policy "Users can update own builder messages"
  on public.builder_messages for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own builder messages"
  on public.builder_messages for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- live_threads
-- ---------------------------------------------------------------------------
create table public.live_threads (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index live_threads_agent_id_idx on public.live_threads (agent_id);
create index live_threads_user_id_idx on public.live_threads (user_id);

create trigger set_live_threads_updated_at
  before update on public.live_threads
  for each row execute function public.set_updated_at();

alter table public.live_threads enable row level security;

create policy "Users can view own live threads"
  on public.live_threads for select
  using (auth.uid() = user_id);

create policy "Users can insert own live threads"
  on public.live_threads for insert
  with check (auth.uid() = user_id);

create policy "Users can update own live threads"
  on public.live_threads for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own live threads"
  on public.live_threads for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- live_messages
-- ---------------------------------------------------------------------------
create table public.live_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.live_threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text check (role in ('user', 'assistant')),
  content text not null,
  artifacts jsonb default '[]',
  citations jsonb default '[]',
  created_at timestamptz not null default now()
);

create index live_messages_thread_id_created_at_idx
  on public.live_messages (thread_id, created_at);

alter table public.live_messages enable row level security;

create policy "Users can view own live messages"
  on public.live_messages for select
  using (auth.uid() = user_id);

create policy "Users can insert own live messages"
  on public.live_messages for insert
  with check (auth.uid() = user_id);

create policy "Users can update own live messages"
  on public.live_messages for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own live messages"
  on public.live_messages for delete
  using (auth.uid() = user_id);
