# Coding Agent 9/10 — Implementation baseline

Recorded at start of upgrade work.

| Item | Value |
|------|-------|
| Git HEAD | `2478ff142528422ab6779b4899b6135e8a4dac6a` |
| Agent-service tests | 366 passed, 6 failed (Supabase config tests in local env) |
| Prod Cloud Run | `stack32-agent-api` europe-west1, image tagged by commit SHA |

## Pre-upgrade platform model defaults (`config.py`)

- FAST: `openai/gpt-5.4-mini` / fallback `xai/grok-4`
- BALANCED: `openai/gpt-5.4` / fallback `xai/grok-4.5`
- REASONING: `openai/gpt-5.4` / fallback `xai/grok-4.5`
- CODING: `openai/gpt-5.4` / fallback `xai/grok-code-fast-1` + **BALANCED chain in `resolve_models`**
- VALIDATOR: `openai/gpt-5.4-mini` / fallback `xai/grok-4`

## Known weaknesses addressed by this upgrade

See plan: repair rescaffold, BALANCED coding fallback, no RepairContract, weak test gates, aggregated usage only, outdated token rates.
