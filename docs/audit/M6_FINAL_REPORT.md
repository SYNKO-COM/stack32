# M6 Final Report — Stack32 Production Runtime

**Branch:** `feat/production-runtime`  
**Date:** 2026-08-05  

## Audit → fixes summary

| Issue | Resolution |
|---|---|
| LLM node passthrough / no tool loop | M1 LangGraph runtime + ModelGateway tool calls (flagged) |
| Manual first-edge runner | Parallel fan-out + LangGraph path |
| Live history missing | `load_live_history` + conversation summaries |
| Memory decorative | Graph nodes + candidate extract + ownership RPCs |
| RAG `auth.uid()` under service role | `p_user_id` + ownership joins |
| Fake text ingest | Storage upload + PDF/TXT/MD/CSV extract |
| BYOK before build | Deferred to Ready→Live / Live |
| Key encrypt-only | Provider ping before encrypt |
| Queue enqueue+inline | `dispatch_run` exclusive modes |
| No OAuth connections | ConnectionManager Google + scaffolding others |
| No project files / SSE | `agent_project_files` + SSE Last-Event-ID + poll fallback |

## Labels

| Capability | Label |
|---|---|
| Builder identity / capabilities / build | **Operational** |
| Dynamic clarifying questions | **Operational** (heuristic) |
| Project files (`agent.json` / `graph.json` / `tools.json`) | **Operational** |
| BYOK after build + key validation | **Operational** (mock ping; live ping needs provider) |
| View changes drawer | **Operational** |
| Builder SSE stream | **Operational** (with poll fallback) |
| Typed repair (`AgentFailureReport`) | **Operational** (minimal patches) |
| LangGraph calculator / tool loop | **Operational** under `AGENT_RUNTIME_VERSION=langgraph` |
| Memory read/write + inspect/delete API | **Operational** |
| Knowledge Storage ingest PDF/TXT/MD/CSV | **Operational** (OCR PDF → clear `PDF_OCR_REQUIRED`) |
| Vector RPC ownership | **Operational** (apply migration) |
| Google OAuth + Gmail/Calendar tools | **Requires credentials** |
| Binding isolation journeys D/E/G | **Requires credentials** |
| Microsoft / Slack / Notion | **Scaffolded** (disabled) |
| Exclusive queue + schedules tick | **Operational** (worker optional) |
| Publish immutable hosted | **Operational** (pre-existing + queue path) |
| E2E Playwright journeys A–G | **Not implemented** as full suite (unit/integration cover core) |
| Gmail watch listeners | **Not implemented** (by design) |

## Env checklist (prod)

- [ ] `AI_EXECUTION_MODE=live`
- [ ] `AGENT_RUNTIME_VERSION=langgraph` after soak
- [ ] `QUEUE_INLINE=false` + `QUEUE_WORKER_ENABLED=true` (or Cloud Tasks)
- [ ] `SECRETS_ENCRYPTION_KEY`
- [ ] `GOOGLE_OAUTH_*` for connections
- [ ] Apply migrations M2–M5 + pgTAP

## Test results (local agent-service)

`AI_EXECUTION_MODE=mock .venv/bin/pytest -q` → **56 passed** (2026-08-05).
Web `tsc --noEmit` → clean.

## Security notes

- OAuth tokens encrypted; never in API JSON or LLM prompts.
- RLS: client cannot write connections/project files/schedules.
- Vector RPCs verify agent ownership with explicit `p_user_id`.
- SSRF guards retained on URL ingest.
- Disabled connectors must not be presented as operational in UI marketing copy.
