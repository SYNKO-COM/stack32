-- Chrome is a user/installation/session capability, never a creator credential.
create table public.browser_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null references public.agent_installations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  thread_id uuid not null references public.live_threads(id) on delete cascade,
  origin text not null,
  agent_name text not null,
  pairing_hash text unique,
  token_hash text unique,
  state text not null default 'pairing' check (state in ('pairing','active','revoked')),
  expires_at timestamptz not null,
  web_seen_at timestamptz not null default now(),
  device_seen_at timestamptz,
  steps integer not null default 0 check (steps between 0 and 30),
  created_at timestamptz not null default now()
);
create table public.browser_commands (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.browser_sessions(id) on delete cascade,
  action jsonb not null,
  result jsonb,
  state text not null default 'pending' check (state in ('pending','claimed','done','canceled')),
  expires_at timestamptz not null default now() + interval '60 seconds',
  created_at timestamptz not null default now()
);
create index browser_sessions_owner on public.browser_sessions(user_id, installation_id, thread_id);
create index browser_commands_session on public.browser_commands(session_id, created_at);
alter table public.browser_sessions enable row level security;
alter table public.browser_commands enable row level security;
-- All access passes through the API, including ownership checks. No direct client grants.
revoke all on public.browser_sessions, public.browser_commands from anon, authenticated;
grant all on public.browser_sessions, public.browser_commands to service_role;

create function public.browser_enqueue(p_session uuid, p_action jsonb)
returns setof public.browser_commands language plpgsql security invoker set search_path = public as $$
begin
  perform 1 from browser_sessions where id=p_session and state='active'
    and expires_at>now() and web_seen_at>now()-interval '30 seconds'
    and device_seen_at>now()-interval '15 seconds' and steps<30 for update;
  if not found then raise exception 'BROWSER_SESSION_UNAVAILABLE'; end if;
  if exists(select 1 from browser_commands where session_id=p_session
      and state in ('pending','claimed') and expires_at>now()) then
    raise exception 'BROWSER_BUSY';
  end if;
  update browser_sessions set steps=steps+1 where id=p_session;
  return query insert into browser_commands(session_id,action) values(p_session,p_action) returning *;
end $$;
revoke all on function public.browser_enqueue(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.browser_enqueue(uuid,jsonb) to service_role;
