# Milestone 0 — Baseline audit

_Date: 2026-08-05_  
_Branch: `feat/production-runtime`_  
_Baseline SHA (CI fix commit): `8b17a7fda91301d77ad82752158d7046ea84ae9c`_  
_Parent main: `e1e6a2d`_

## Test results (local)

| Suite | Result |
| --- | --- |
| `pnpm lint` | pass |
| `pnpm typecheck` | pass |
| `pnpm --filter @stack32/web test` | 16 passed |
| `ruff check` (agent-service) | pass |
| `pytest` (agent-service) | 37 passed |

## Confirmed gaps (see production plan)

- LLM node passthrough; no agentic tool loop; first-edge-only runner
- No LangGraph StateGraph/checkpointer usage despite dependency
- Live history not loaded; memory/RAG incomplete; file ingest text-only
- Queue enqueue + inline duplication; BYOK before build capabilities
- No OAuth connectors / project files / SSE streaming
- `AGENT_RUNTIME_VERSION` introduced (default `legacy`)

## Separation: Builder vs generated agent

| Concern | Builder | Generated agent |
| --- | --- | --- |
| Module | `builder/orchestrator.py` | `runtime/live.py` + compiler |
| LLM keys | Platform (`OPENAI_*`, …) | User BYOK (`user_secrets`) when Live |
| Business OAuth | Detect/request only | Execute via connection bindings |
| Spec ownership | Writes AgentSpec/GraphSpec | Executes published/draft spec |
| Tools | Design-time allowlist | Runtime allowlist + bindings |

## Env inventory (critical)

- Web: `AI_EXECUTION_MODE=mock|disabled|agent-service`
- Agent: `AI_EXECUTION_MODE`, `AGENT_RUNTIME_VERSION`, `QUEUE_INLINE`, `LIVE_REQUIRE_USER_LLM_KEY`, `SECRETS_ENCRYPTION_KEY`, provider keys, `DATABASE_URL`

## Migrations

Forward-only from repo `supabase/migrations/`. No remote reset. Hosted schema comparison deferred to operator; local migrations are source of truth for this branch.

## Feature flag

```text
AGENT_RUNTIME_VERSION=legacy     # current while-loop runner (default)
AGENT_RUNTIME_VERSION=langgraph  # new StateGraph path (Milestone 1+)
```

No production switch until M1 E2E exit criteria pass.
