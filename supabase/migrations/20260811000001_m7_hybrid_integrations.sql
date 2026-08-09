-- Milestone 7: hybrid integrations — agent status, catalog cache, connection providers.

-- ---------------------------------------------------------------------------
-- agents.status: waiting_for_input + needs_setup
-- ---------------------------------------------------------------------------
alter table public.agents drop constraint if exists agents_status_check;
alter table public.agents
  add constraint agents_status_check check (
    status in (
      'draft',
      'building',
      'waiting_for_input',
      'needs_setup',
      'ready',
      'needs_attention',
      'published',
      'archived'
    )
  );

-- ---------------------------------------------------------------------------
-- tool_definitions: hybrid provider cache columns
-- ---------------------------------------------------------------------------
alter table public.tool_definitions
  add column if not exists provider text not null default 'native',
  add column if not exists provider_tool_id text,
  add column if not exists provider_app_id text,
  add column if not exists provider_version text,
  add column if not exists source text not null default 'native'
    check (source in ('native', 'pipedream', 'mcp', 'custom_api', 'legacy')),
  add column if not exists cached_at timestamptz,
  add column if not exists stale_after timestamptz,
  add column if not exists auth_type text not null default 'none'
    check (auth_type in ('oauth2', 'api_key', 'none', 'custom')),
  add column if not exists connection_required boolean not null default false,
  add column if not exists categories text[] not null default '{}',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists approval_mode text not null default 'never'
    check (approval_mode in ('never', 'always', 'conditional')),
  add column if not exists timeout_seconds integer not null default 30
    check (timeout_seconds between 1 and 600),
  add column if not exists max_response_bytes integer not null default 200000
    check (max_response_bytes between 1024 and 5000000);

create index if not exists tool_definitions_provider_idx
  on public.tool_definitions (provider, provider_tool_id);
create index if not exists tool_definitions_source_idx
  on public.tool_definitions (source);
create index if not exists tool_definitions_keywords_gin
  on public.tool_definitions using gin (keywords);
create index if not exists tool_definitions_stale_idx
  on public.tool_definitions (stale_after)
  where stale_after is not null;

-- Mark seeded connector tools as connection-required.
update public.tool_definitions
set
  connection_required = true,
  auth_type = 'oauth2',
  approval_mode = case when side_effect then 'always' else 'never' end,
  provider = coalesce(connector_id, 'native'),
  provider_app_id = connector_id,
  provider_tool_id = id
where connector_id is not null;

-- Split Gmail draft vs send in catalog (send remains high-risk).
insert into public.tool_definitions (
  id, namespace, name, summary, risk, side_effect, connector_id, keywords,
  provider, provider_tool_id, provider_app_id, source, auth_type,
  connection_required, approval_mode, categories
) values
  (
    'gmail_list', 'email', 'Gmail List', 'List Gmail messages matching a query.',
    'low', false, 'google', array['email','gmail','inbox','list','mail'],
    'native', 'gmail_list', 'google', 'native', 'oauth2', true, 'never',
    array['email','google']
  ),
  (
    'gmail_read', 'email', 'Gmail Read', 'Read a single Gmail message by id.',
    'low', false, 'google', array['email','gmail','read','mail'],
    'native', 'gmail_read', 'google', 'native', 'oauth2', true, 'never',
    array['email','google']
  ),
  (
    'gmail_create_draft', 'email', 'Gmail Create Draft', 'Create a Gmail draft without sending.',
    'medium', true, 'google', array['email','gmail','draft','mail'],
    'native', 'gmail_create_draft', 'google', 'native', 'oauth2', true, 'conditional',
    array['email','google']
  ),
  (
    'gmail_send_message', 'email', 'Gmail Send Message', 'Send an email via Gmail (side-effect).',
    'high', true, 'google', array['email','gmail','send','mail'],
    'native', 'gmail_send_message', 'google', 'native', 'oauth2', true, 'always',
    array['email','google']
  ),
  (
    'calendar_list', 'calendar', 'Calendar List', 'List upcoming Google Calendar events.',
    'low', false, 'google', array['calendar','events','schedule','list'],
    'native', 'calendar_list', 'google', 'native', 'oauth2', true, 'never',
    array['calendar','google']
  ),
  (
    'structured_output', 'utility', 'Structured Output', 'Return a structured JSON payload.',
    'low', false, null, array['json','structured','output'],
    'native', 'structured_output', null, 'native', 'none', false, 'never',
    array['utility']
  ),
  (
    'http_request', 'utility', 'HTTP Request', 'Call an allowlisted custom HTTP API.',
    'high', true, null, array['http','api','custom','webhook'],
    'custom_api', 'http_request', null, 'custom_api', 'api_key', true, 'always',
    array['custom']
  )
on conflict (id) do update set
  summary = excluded.summary,
  risk = excluded.risk,
  side_effect = excluded.side_effect,
  connection_required = excluded.connection_required,
  approval_mode = excluded.approval_mode,
  provider = excluded.provider,
  provider_tool_id = excluded.provider_tool_id,
  provider_app_id = excluded.provider_app_id,
  source = excluded.source,
  auth_type = excluded.auth_type,
  categories = excluded.categories,
  keywords = excluded.keywords;

insert into public.tool_versions (tool_id, version, input_schema) values
  ('gmail_list', 1, '{"type":"object","properties":{"query":{"type":"string"},"max_results":{"type":"integer"}},"required":[]}'::jsonb),
  ('gmail_read', 1, '{"type":"object","properties":{"message_id":{"type":"string"}},"required":["message_id"]}'::jsonb),
  ('gmail_create_draft', 1, '{"type":"object","properties":{"to":{"type":"string"},"subject":{"type":"string"},"body":{"type":"string"}},"required":["to","subject","body"]}'::jsonb),
  ('gmail_send_message', 1, '{"type":"object","properties":{"to":{"type":"string"},"subject":{"type":"string"},"body":{"type":"string"},"dry_run":{"type":"boolean"}},"required":["to","subject","body"]}'::jsonb),
  ('calendar_list', 1, '{"type":"object","properties":{"max_results":{"type":"integer"}},"required":[]}'::jsonb),
  ('structured_output', 1, '{"type":"object","properties":{"data":{"type":"object"},"schema_name":{"type":"string"}},"required":["data"]}'::jsonb),
  ('http_request', 1, '{"type":"object","properties":{"url":{"type":"string"},"method":{"type":"string"},"headers":{"type":"object"},"body":{"type":"string"}},"required":["url"]}'::jsonb)
on conflict (tool_id, version) do nothing;

-- Keep legacy gmail_send alias pointing at send semantics in metadata.
update public.tool_definitions
set
  metadata = coalesce(metadata, '{}'::jsonb) || '{"alias_of":"gmail_send_message","deprecated":true}'::jsonb,
  connection_required = true,
  auth_type = 'oauth2',
  approval_mode = 'always',
  provider = 'native',
  provider_app_id = 'google',
  provider_tool_id = 'gmail_send',
  source = 'native'
where id = 'gmail_send';

-- ---------------------------------------------------------------------------
-- user_connections: broaden providers + external account refs
-- ---------------------------------------------------------------------------
alter table public.user_connections drop constraint if exists user_connections_provider_check;
alter table public.user_connections
  add constraint user_connections_provider_check check (
    provider ~ '^[a-z][a-z0-9_]{1,62}$'
  );

alter table public.user_connections
  add column if not exists external_account_id text,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

create index if not exists user_connections_external_idx
  on public.user_connections (provider, external_account_id)
  where external_account_id is not null;

-- Harden write policies (explicit deny for update/delete from clients)
create policy user_connections_no_client_update on public.user_connections
  for update using (false);
create policy user_connections_no_client_delete on public.user_connections
  for delete using (false);
create policy bindings_no_client_update on public.agent_connection_bindings
  for update using (false);
create policy bindings_no_client_delete on public.agent_connection_bindings
  for delete using (false);
create policy approvals_no_client_update on public.agent_approval_requests
  for update using (false);
create policy approvals_no_client_delete on public.agent_approval_requests
  for delete using (false);

-- ---------------------------------------------------------------------------
-- connector_definitions: pipedream scaffold
-- ---------------------------------------------------------------------------
insert into public.connector_definitions (id, provider, name, summary, auth_type, scopes)
values
  ('pipedream', 'pipedream', 'Pipedream', 'Pipedream Connect marketplace apps.', 'oauth2', '{}')
on conflict (id) do nothing;
