-- Stack32 — Support chat (user <-> Stack32 team) + admin operations groundwork.
--
-- 1. support_conversations / support_messages: the in-app chat bubble writes
--    here with the user's own session (RLS-scoped), the admin console reads
--    and replies through the service role.
-- 2. admin_audit_log: every action performed from the admin console is
--    recorded here. RLS enabled with no policies — service role only.
-- 3. credit_topups: allow negative "admin adjustment" rows so the console can
--    remove credits as well as grant them. resolve_user_entitlements() already
--    sums credits/budget_usd, so negative rows flow through unchanged.

-- ---------------------------------------------------------------------------
-- 1a. Conversations
-- ---------------------------------------------------------------------------
create table public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text check (subject is null or char_length(subject) <= 200),
  status text not null default 'open'
    check (status in ('open', 'pending', 'resolved', 'closed')),
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  last_message_sender text
    check (last_message_sender in ('user', 'admin')),
  user_unread_count integer not null default 0 check (user_unread_count >= 0),
  admin_unread_count integer not null default 0 check (admin_unread_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_conversations_user_id_idx
  on public.support_conversations (user_id, last_message_at desc);
create index support_conversations_status_idx
  on public.support_conversations (status, last_message_at desc);

create trigger support_conversations_set_updated_at
  before update on public.support_conversations
  for each row execute function public.set_updated_at();

alter table public.support_conversations enable row level security;

create policy "support_conversations_select_own"
  on public.support_conversations for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "support_conversations_insert_own"
  on public.support_conversations for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- Status/unread transitions happen through security-definer helpers below.
revoke update, delete on public.support_conversations from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 1b. Messages
-- ---------------------------------------------------------------------------
create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.support_conversations (id) on delete cascade,
  sender text not null check (sender in ('user', 'admin')),
  -- Author uuid for user messages; null for admin replies (admins are not
  -- Supabase users). admin_label carries the display name instead.
  author_id uuid references auth.users (id) on delete set null,
  admin_label text check (admin_label is null or char_length(admin_label) <= 80),
  body text not null check (char_length(body) between 1 and 8000),
  created_at timestamptz not null default now()
);

create index support_messages_conversation_idx
  on public.support_messages (conversation_id, created_at);

alter table public.support_messages enable row level security;

create policy "support_messages_select_own_conversation"
  on public.support_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.support_conversations c
      where c.id = conversation_id
        and c.user_id = (select auth.uid())
    )
  );

create policy "support_messages_insert_user_role"
  on public.support_messages for insert
  to authenticated
  with check (
    sender = 'user'
    and author_id = (select auth.uid())
    and exists (
      select 1 from public.support_conversations c
      where c.id = conversation_id
        and c.user_id = (select auth.uid())
    )
  );

revoke update, delete on public.support_messages from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 1c. Denormalized conversation state, kept by trigger on message insert
-- ---------------------------------------------------------------------------
create or replace function private.support_message_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_conversations c
  set
    last_message_at = new.created_at,
    last_message_preview = left(new.body, 140),
    last_message_sender = new.sender,
    user_unread_count = case
      when new.sender = 'admin' then c.user_unread_count + 1
      else c.user_unread_count
    end,
    admin_unread_count = case
      when new.sender = 'user' then c.admin_unread_count + 1
      else c.admin_unread_count
    end,
    -- A new user message reopens a resolved/closed thread.
    status = case
      when new.sender = 'user' and c.status in ('resolved', 'closed')
        then 'open'
      when new.sender = 'admin' and c.status = 'open'
        then 'pending'
      else c.status
    end
  where c.id = new.conversation_id;
  return new;
end;
$$;

revoke all on function private.support_message_after_insert() from public, anon;

create trigger support_messages_after_insert
  after insert on public.support_messages
  for each row execute function private.support_message_after_insert();

-- The user marks their side of a conversation read.
create or replace function public.support_mark_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_conversations c
  set user_unread_count = 0
  where c.id = p_conversation_id
    and c.user_id = auth.uid();
end;
$$;

revoke all on function public.support_mark_read(uuid) from public, anon;
grant execute on function public.support_mark_read(uuid)
  to authenticated, service_role;

-- Realtime: the chat bubble subscribes to both tables (RLS still applies).
alter publication supabase_realtime add table public.support_messages;
alter publication supabase_realtime add table public.support_conversations;

-- ---------------------------------------------------------------------------
-- 2. Admin audit log — service role only.
-- ---------------------------------------------------------------------------
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_email text not null,
  action text not null,
  target_user_id uuid,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);
create index admin_audit_log_target_user_idx
  on public.admin_audit_log (target_user_id, created_at desc);

alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. credit_topups — allow signed admin adjustments.
--    Positive rows keep their old shape; negative rows must carry a negative
--    budget so entitlements (sum of credits / sum of budget_usd) stay aligned.
-- ---------------------------------------------------------------------------
alter table public.credit_topups
  drop constraint credit_topups_credits_check;
alter table public.credit_topups
  add constraint credit_topups_credits_check
  check (credits <> 0 and credits between -10000 and 10000);

alter table public.credit_topups
  drop constraint credit_topups_budget_usd_check;
alter table public.credit_topups
  add constraint credit_topups_budget_usd_check
  check (
    (credits > 0 and budget_usd >= 0)
    or (credits < 0 and budget_usd <= 0)
  );
