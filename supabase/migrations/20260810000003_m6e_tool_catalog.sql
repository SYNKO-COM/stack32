-- Milestone E: versioned tool + connector catalog for generated agents.
-- Enables just-in-time schema loading: the Builder searches summaries and loads
-- a specific tool version's schema on demand instead of exposing all schemas.

create table if not exists public.connector_definitions (
  id text primary key,
  provider text not null,
  name text not null,
  summary text not null default '',
  auth_type text not null default 'oauth2' check (auth_type in ('oauth2', 'api_key', 'none')),
  scopes text[] not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tool_definitions (
  id text primary key,
  namespace text not null,
  name text not null,
  summary text not null default '',
  risk text not null default 'low' check (risk in ('low', 'medium', 'high')),
  side_effect boolean not null default false,
  connector_id text references public.connector_definitions (id) on delete set null,
  latest_version integer not null default 1,
  enabled boolean not null default true,
  keywords text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.tool_versions (
  id uuid primary key default gen_random_uuid(),
  tool_id text not null references public.tool_definitions (id) on delete cascade,
  version integer not null,
  input_schema jsonb not null default '{}'::jsonb,
  output_schema jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tool_id, version)
);

create index if not exists tool_definitions_namespace_idx on public.tool_definitions (namespace);
create index if not exists tool_versions_tool_idx on public.tool_versions (tool_id, version desc);

-- Catalog is readable by all authenticated users; writes are service-role only.
alter table public.connector_definitions enable row level security;
alter table public.tool_definitions enable row level security;
alter table public.tool_versions enable row level security;

create policy connector_definitions_read on public.connector_definitions for select using (true);
create policy connector_definitions_no_write on public.connector_definitions for insert with check (false);
create policy tool_definitions_read on public.tool_definitions for select using (true);
create policy tool_definitions_no_write on public.tool_definitions for insert with check (false);
create policy tool_versions_read on public.tool_versions for select using (true);
create policy tool_versions_no_write on public.tool_versions for insert with check (false);

-- Seed connectors.
insert into public.connector_definitions (id, provider, name, summary, auth_type, scopes) values
  ('google', 'google', 'Google', 'Google Workspace connector (Gmail, Calendar).', 'oauth2',
   array['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/calendar.events']),
  ('slack', 'slack', 'Slack', 'Slack workspace connector.', 'oauth2', array['chat:write'])
on conflict (id) do nothing;

-- Seed tool definitions.
insert into public.tool_definitions (id, namespace, name, summary, risk, side_effect, connector_id, keywords) values
  ('web_search', 'research', 'Web Search', 'Search the web for current information.', 'low', false, null, array['search','web','news','research']),
  ('fetch_url', 'research', 'Fetch URL', 'Fetch and read a web page.', 'low', false, null, array['url','fetch','web','scrape']),
  ('calculator', 'utility', 'Calculator', 'Evaluate arithmetic expressions.', 'low', false, null, array['math','calculate','arithmetic']),
  ('current_datetime', 'utility', 'Current Date/Time', 'Get the current UTC datetime.', 'low', false, null, array['time','date','now','clock']),
  ('knowledge_search', 'knowledge', 'Knowledge Search', 'Search the agent knowledge base (RAG).', 'low', false, null, array['knowledge','rag','documents','retrieval']),
  ('gmail_send', 'email', 'Gmail Send', 'Send an email via Gmail.', 'high', true, 'google', array['email','gmail','send','mail']),
  ('calendar_create_event', 'calendar', 'Create Calendar Event', 'Create a Google Calendar event.', 'high', true, 'google', array['calendar','event','appointment','schedule','meeting']),
  ('slack_post_message', 'chat', 'Slack Post Message', 'Post a message to a Slack channel.', 'high', true, 'slack', array['slack','message','chat','notify'])
on conflict (id) do nothing;

insert into public.tool_versions (tool_id, version, input_schema) values
  ('web_search', 1, '{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}'::jsonb),
  ('fetch_url', 1, '{"type":"object","properties":{"url":{"type":"string"}},"required":["url"]}'::jsonb),
  ('calculator', 1, '{"type":"object","properties":{"expression":{"type":"string"}},"required":["expression"]}'::jsonb),
  ('current_datetime', 1, '{"type":"object","properties":{},"required":[]}'::jsonb),
  ('knowledge_search', 1, '{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}'::jsonb),
  ('gmail_send', 1, '{"type":"object","properties":{"to":{"type":"string"},"subject":{"type":"string"},"body":{"type":"string"}},"required":["to","subject","body"]}'::jsonb),
  ('calendar_create_event', 1, '{"type":"object","properties":{"title":{"type":"string"},"start":{"type":"string"},"end":{"type":"string"}},"required":["title","start","end"]}'::jsonb),
  ('slack_post_message', 1, '{"type":"object","properties":{"channel":{"type":"string"},"text":{"type":"string"}},"required":["channel","text"]}'::jsonb)
on conflict (tool_id, version) do nothing;
