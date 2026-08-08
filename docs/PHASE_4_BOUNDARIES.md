# Phase 4 Boundaries

Updated for production runtime (M4+).

## Now available (Google first)

- Google OAuth PKCE via `ConnectionManager` (`user_connections`, `oauth_connection_states`)
- Agent bindings (`agent_connection_bindings`) — tokens never exposed to LLM/API JSON
- Gmail list/read/draft + Calendar list tools (`connections/google_tools.py`) — **Requires credentials**
- Approval request table (`agent_approval_requests`) for side-effect interrupts
- AgentSpec V3 additive fields: `connection_requirements`, `connection_bindings`, `approvals`, `triggers`

## Still scaffolded / disabled

- Microsoft / Slack / Notion adapters (`enabled=False` stubs)
- Event listeners and always-on autonomous loops
- Gmail watch / push listeners
- Public agent API keys, embeddable widgets, public share links
- User-defined HTTP tools and user-generated Python tools
- Sandbox code execution / user MCP servers
- Permanent Cloud Run worker pools / Temporal workflows
- Agent marketplace / teams & organizations

## Schedules

- `agent_schedules` can be enabled from Builder capabilities (`schedule_hourly`)
- Internal tick: `POST /v1/internal/tasks/schedules/tick` enqueues audited runs
- Complex cron evaluation remains minimal (hourly via external cron calling tick)

Do **not** mark Microsoft/Slack/Notion as operational without credentials + journey tests.
