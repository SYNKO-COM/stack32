# Pipedream Connect — Stack32 knowledge base

Curated for Stack32 Builder / runtime. Prefer this file + `app_hints.json` over inventing Connect behavior.
Upstream index: https://pipedream.com/docs/llms.txt

## Hard rules (always)

1. **Auth prop name ≠ app slug.** Use the exact `configurable_props[].name` where `type=app` (e.g. `googleCalendar`, not `google_calendar`). See [troubleshooting](https://pipedream.com/docs/connect/components/troubleshooting).
2. **Dynamic props require `dynamic_props_id`.** After any prop with `reloadProps: true`, call reload (`POST .../actions/props` or `.../components/props`), keep `dynamicProps.id` (`dyp_…`), pass it on every subsequent `run` / `deploy`. Docs: [Executing Actions](https://pipedream.com/docs/connect/components/actions), [troubleshooting](https://pipedream.com/docs/connect/components/troubleshooting).
3. **Never trust the LLM for `authProvisionId`.** Server resolves the bound account; inject auth into `configured_props` yourself.
4. **external_user_id** = Stack32 user id (≤250 chars). Isolate **development** vs **production** environments.
5. **Surgical agent edits:** when fixing Live tool failures, do not remove required tools or rewrite the agent.

## Core API map

| Intent | Endpoint (project-scoped) |
|--------|---------------------------|
| OAuth for Pipedream API | `POST /v1/oauth/token` (client_credentials) |
| Connect token for user | `POST /v1/connect/{project_id}/tokens` |
| List/retrieve component | Connect components APIs |
| Remote options | `POST .../actions/configure` or `.../components/configure` (`prop_name` + `configured_props`) |
| Reload dynamic props | `POST .../actions/props` or `.../components/props` |
| Run action | `POST .../actions/run` (+ optional `dynamic_props_id`, `stash_id`) |
| Deploy trigger | `POST .../components/triggers/deploy` (+ `webhook_url`) |
| Proxy upstream API | `POST .../proxy/...` with `external_user_id` + `account_id` |

SDK packages: `@pipedream/sdk` (TS), `pipedream` (Python), Java SDK — see [SDKs](https://pipedream.com/docs/connect/api-reference/sdks).

## Auth / users / environments

- Tokens expire in **4 hours**, single-use; optional `webhook_uri` for `CONNECTION_SUCCESS` / `CONNECTION_ERROR`.
- Development: max **10** external users; must be signed into pipedream.com when connecting; production needs Connect plan.
- Multiple accounts per app are allowed; workflows historically pick the most recent — Stack32 must bind **per app** explicitly.
- Delete account / user via Connect accounts/users DELETE APIs (irreversible for user delete).

## Actions execution checklist

1. Retrieve component → read `configurable_props`, note `reloadProps`, `remoteOptions`, `stash`, `format: file-ref`.
2. Resolve `authProvisionId` for the app prop name.
3. Configure remote options props in order (include prior `configured_props`).
4. If any `reloadProps`: reload → store `dynamicProps.id`.
5. Run with full `configured_props` + `dynamic_props_id` when required.
6. File outputs: pass `stash_id` (`""` / `NEW` / `true` for new); reuse `stashId` for 24h; `get_url` ~30 min.

## Proxy

Use when no prebuilt action fits. Check `connect.proxy_enabled`. Static domains: full URL or relative path. Dynamic domains (GitLab, Zendesk…): **relative paths only**. Timeout ~30s → 504. Strip restricted hop-by-hop headers.

## Triggers

App-based need Managed Auth. Native: HTTP / schedule / email (no user OAuth). Polling: `timer.intervalSeconds`. Prefer `emit_on_deploy: false` when historical events must not hit customer webhooks. Validate `x-pd-signature` on deliveries.

## MCP

Per-app MCP at https://mcp.pipedream.com powered by Connect. Credentials stay on Pipedream; tools map from registry actions. Production on-behalf-of-users requires Connect plan. See [MCP developers](https://pipedream.com/docs/connect/mcp/developers).

## Stack32-specific lessons (proven)

| Symptom | Fix |
|---------|-----|
| Calendar create via PD: `Missing required parameters: text` / silent fail | Auth key `googleCalendar`; fields `eventStartDate`/`eventEndDate`; quick-add needs `text` |
| Canva create: `'name' must not be null` | Default `designType=preset` + `name=doc`, then **reload props** and pass `dynamic_props_id` |
| Tools “Connected” but fail | Compare `run_events` message to component props; check app prop camelCase |

See also: `docs/playbooks/live-tool-failures.md`.

## Learning loop (product)

Stack32 cannot pre-define every agent. For each new Pipedream tool:

1. Load `app_hints.json` + any learned playbook for `action_id`.
2. Generate Structure config UI from component schema + hints + playbook.
3. On Live success, persist the working static/runtime field set as a playbook.
4. On Live failure + Try to fix, repair surgically using this knowledge base.

## Source links (primary)

- https://pipedream.com/docs/connect/components
- https://pipedream.com/docs/connect/components/actions
- https://pipedream.com/docs/connect/components/triggers
- https://pipedream.com/docs/connect/components/files
- https://pipedream.com/docs/connect/components/troubleshooting
- https://pipedream.com/docs/connect/managed-auth/quickstart
- https://pipedream.com/docs/connect/api-proxy
- https://pipedream.com/docs/connect/webhooks
- https://pipedream.com/docs/connect/mcp
- https://pipedream.com/docs/connect/api-reference/introduction
- https://pipedream.com/docs/connect/api-reference/sdks
- https://pipedream.com/docs/llms.txt
