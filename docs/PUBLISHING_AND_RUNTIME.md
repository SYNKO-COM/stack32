# Publishing and runtime — Definition vs Installation

Stack32 separates a portable **definition** (what the agent is) from a per-user **installation** (how it runs for that account). The same person can be both creator and consumer; behaviors differ by surface, not by account type.

## Core objects

| Concept | Persistence | Meaning |
| --- | --- | --- |
| **Definition** | `agents` + draft/published `agent_versions.spec` | Portable AgentSpec + GraphSpec. Must not embed the creator’s OAuth tokens or LLM secrets. |
| **Version** | `agent_versions` | Immutable snapshot of a definition at publish/test time (`version_number`, `test_status`, `spec`). |
| **Snapshot / project files** | Builder project artifacts / `agent_projects` | File-oriented view of the definition used by the coding sandbox and Structure UI. |
| **Deployment** | `agent_deployments` | Hosted publish record (`status=active`, pinned `agent_version_id`, environment). Created by `POST /v1/agents/{id}/publish`. |
| **Installation** | `agent_installations` | Per-user runtime binding to a definition: connections, tool config, BYOK, memory, schedules. |
| **Run** | `runs` + `run_events` | One build/live/test/repair/ingestion execution. Queued via postgres `run_queue` or Cloud Tasks; worker payload is `{ "run_id" }` only. |

## Publish path (creator)

1. Own the agent.
2. Valid AgentSpec + GraphSpec; graph compiles.
3. **Definition readiness** (`evaluate_definition_readiness`) — portable template checks; does **not** require the creator’s OAuth/LLM to be present on the definition.
4. Sanitizer (`assert_portable_definition`) strips account-specific static config that belongs on Installation.
5. Draft version `test_status` in `passed` | `passed_with_warnings`.
6. Insert immutable `agent_deployments` row; set `agents.published_version_id`.

Unpublish disables the active deployment and clears `published_version_id`. Hosted runs do not depend on the creator’s laptop.

## Live path (consumer)

1. `get_or_create` an `agent_installations` row for `(user_id, agent_id)`.
2. **Installation readiness** — LLM (BYOK), connections, tool config, memory.
3. Live execute under that installation’s secrets and bindings.
4. Runs are dispatched exclusively: either inline (`QUEUE_INLINE=true`) or enqueue-only (`QUEUE_INLINE=false` → postgres or Cloud Tasks). Never both.

## Creator vs consumer (same account)

| Behavior | As creator | As consumer (incl. own agent) |
| --- | --- | --- |
| Builder / Structure | Edits draft definition; platform LLM keys OK | N/A |
| Publish gate | Definition readiness + sanitizer + tests | N/A |
| Live chat | Optional smoke as owner | Installation readiness; user BYOK by default |
| Connections / secrets | Must not be baked into published spec | Stored on the installation / user secret store |
| Schedules | Defined on agent | Fired for the installation’s user; enqueue live runs |

Publishing does **not** copy the creator’s Gmail token or OpenAI key into the template. When the creator runs Live on their own published agent, they still go through an installation like any other user.

## Queue backends

See [CLOUD_EXECUTION.md](./CLOUD_EXECUTION.md).

- Local / default: `QUEUE_BACKEND=postgres`.
- Staging / production: `QUEUE_BACKEND=cloud_tasks` → HTTP task to `POST /v1/internal/tasks/run` (OIDC and/or `X-Internal-Token`).
- Scheduler tick: Cloud Scheduler → `POST /v1/internal/tasks/schedules/tick`.

## Related docs

- [PUBLISHING.md](./PUBLISHING.md) — short publish checklist
- [PRODUCTION_SETUP.md](./PRODUCTION_SETUP.md) — owner GCP / Supabase / E2B checklist
- [AGENT_RUNTIME.md](./AGENT_RUNTIME.md) — graph runner details
