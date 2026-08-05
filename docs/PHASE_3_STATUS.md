# Phase 3 Status

_Last updated: 2026-08-05_

## Delivered

| Area | Label | Notes |
| --- | --- | --- |
| Security audit docs | **Operational** | `docs/security/*` |
| Critical/High remediations | **Operational** | JWT opt-in, timing-safe token, CORS, Dockerfile, quotas |
| AgentSpec V2 + GraphSpec | **Operational** | Pydantic + V1 migrator |
| GraphCompiler | **Operational** | Allowlisted nodes/tools; malicious tests |
| Model gateway + router | **Implemented but not configured** | Needs OpenAI/xAI keys for live LLM |
| Builder orchestrator | **Operational** (mock mode) / **not configured** (live LLM) | Identity interrupt, validate, test, repair ≤2 |
| Live runtime | **Operational** (mock) | Tools, memory, RAG hooks |
| Tool catalog MVP | **Operational** | web_search needs `WEB_SEARCH_API_KEY` |
| Memory + RAG schema | **Operational** | Embeddings need OpenAI key in live mode |
| run_queue hosted continuation | **Operational** locally | Cloud Tasks **Scaffolded** |
| Publishing gates | **Operational** | Via Agent API |
| Structure React Flow | **Operational** | GraphSpec visualization |
| Identity mini-form | **Operational** | i18n EN/FR |
| Terraform staging | **Scaffolded** | No apply without GCP project |
| Staging Cloud deploy | **Deferred** | Awaiting operator GCP setup |
| Langfuse / Sentry | **Implemented but not configured** | Env vars ready |

## Operator actions required

1. Create OpenAI + xAI API keys → `services/agent-service/.env`
2. Push migration `20260805000001_phase3_agent_runtime.sql` (`pnpm supabase:push` — never reset remote)
3. Set `DATABASE_URL` (direct) for future checkpointer use
4. Set web `AI_EXECUTION_MODE=agent-service` and agent-service `AI_EXECUTION_MODE=live`
5. Create GCP project when ready — see `infra/README.md`
6. Rotate any secrets previously shared in chat

## Tests

- Agent-service pytest: **36 passed**
- Frontend unit tests: green (Phase 3 mappers)
- pgTAP Phase 3 file: `supabase/tests/006_phase3_security_test.sql`
- Security workflow: `.github/workflows/security.yml`
