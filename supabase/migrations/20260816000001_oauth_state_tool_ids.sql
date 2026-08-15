-- Persist which product apps/tools an OAuth attempt is for, so Gmail vs
-- Calendar (and other suite apps) bind independently.

alter table public.oauth_connection_states
  add column if not exists tool_ids text[] not null default '{}';
