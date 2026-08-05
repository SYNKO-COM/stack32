# Phase 4 Boundaries

Explicitly **not** implemented in Phase 3:

- Gmail / Slack / Notion / Calendar / CRM OAuth
- External Supabase / Firebase / SQL connectors
- Event listeners and always-on autonomous loops
- Complex recurring schedules / proactive agents
- Public agent API keys, embeddable widgets, public share links
- User-defined HTTP tools and user-generated Python tools
- Sandbox code execution / user MCP servers
- Permanent Cloud Run worker pools / Temporal workflows
- Agent marketplace / teams & organizations

## Prepared interfaces (disabled)

Database placeholders (all `enabled=false` / `status=disabled`):

- `agent_triggers`
- `agent_schedules`
- `external_connections` (stores `secret_ref` only — never raw OAuth tokens)

Tool catalog seeds disabled: `gmail`, `slack`, `notion`, `calendar`, `crm`, `external_database`, `custom_http`, `custom_code`.

Future provider interfaces (conceptual):

- `TriggerProvider`
- `ScheduleProvider`
- `EventSubscriptionProvider`
- `ExternalConnectionProvider`
- `ContinuousWorkerProvider`
