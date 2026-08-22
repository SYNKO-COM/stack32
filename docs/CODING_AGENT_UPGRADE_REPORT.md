# Stack32 Coding Agent 9/10 Upgrade — Rapport final (Part XXVIII)

Date: 2026-08-22  
Baseline HEAD: `2478ff142528422ab6779b4899b6135e8a4dac6a`

## Before (baseline)

- CODING profile appended BALANCED fallback; CodingAgent downgraded on provider errors.
- MODIFY/REPAIR rescaffolded via `CodeBuildPipeline.build()` instead of snapshot restore.
- No RepairContract; toolset freeze UI-only.
- `success = test_status == "passed"` (lint ignored).
- Single aggregated `usage_events` row (`llm.run`); unknown models priced at $1/$3.
- xAI in platform `MODEL_*_FALLBACK` defaults.

See [`CODING_AGENT_UPGRADE_BASELINE.md`](CODING_AGENT_UPGRADE_BASELINE.md).

## After (this upgrade)

### Phase 1 — Routing

- `gateway/model_stage_router.py`: stage-aware chains Luna → Terra → Sol → Claude Sonnet 5.
- `config.py`: OpenAI-first defaults; `MODEL_CODING_EXPERT`, external expert, reasoning expert.
- `model_gateway.py`: no BALANCED append for CODING; `reasoning_effort` + per-profile timeouts.
- `coding/agent.py`: Terra/Sol/Claude chain; no BALANCED fallback.
- `models.yaml` aligned with stage policy.

### Phase 2 — Billing

- Migration `20260831000002_llm_usage_and_reservations.sql`: pricing registry, reservations, `llm_usage_events`.
- `billing/pricing.py`, `economics.py`, `reservations.py`.
- `llm_budget.py`: per-call ledger events with idempotency keys.
- `apps/web/lib/billing/plans.ts`: annual caps $5/$10/$20, conservative unknown rates.

### Phase 3 — Repair paths

- `repair_contract.py`, `repair_engine.py`, `spec_diff_guard.py`.
- Orchestrator: MODIFY/REPAIR → snapshot restore + `build_from_workspace()`.
- Server-side toolset freeze via `filter_unauthorized_tool_bindings` + `clamp_spec_to_repair_contract`.

### Phase 4 — Coding gates

- Tools: `workspace.status`, `workspace.diff`, `exec.run_targeted_test`.
- `success = tests passed AND lint passed`; re-lint after coding repair.
- `RepairLoopController` wired in `build_pipeline.py`.
- `verifier/diff_review.py` structured PASS / REPAIR_REQUIRED / USER_INPUT_REQUIRED.

### Phase 5 — Behavior

- `verifier/behavior.py`: dry-run scenarios; CONNECTION_REQUIRED gate.

### Phase 6 — Browser

- `coding/tools_browser.py` (flag `BUILDER_BROWSER_DEBUG_ENABLED`); allowlisted hosts stub.

### Phase 7 — Context

- `context/tiers.py` + tiered allocation in `ContextEngine`.

### Phase 8 — Observability

- Events: `builder.repair.contract`, `reproduction.started|succeeded|failed`, repair iteration metadata.

### Phase 9 — Benchmark

- `tests/benchmarks/test_builder_routing_benchmark.py` — 18 routing scenarios.

### Phase 10 — Prod rollout checklist

1. **Cloud Run env** (agent-service):
   - `MODEL_FAST_PRIMARY=openai/gpt-5.6-luna`
   - `MODEL_BALANCED_PRIMARY=openai/gpt-5.6-terra`
   - `MODEL_CODING_PRIMARY=openai/gpt-5.6-terra`
   - `MODEL_CODING_EXPERT=openai/gpt-5.6-sol`
   - `MODEL_CODING_EXTERNAL_EXPERT=anthropic/claude-sonnet-5`
   - Remove xAI from platform fallbacks (keep `XAI_API_KEY` for BYOK only).
2. **Supabase**: `supabase db push` — apply `20260831000002_llm_usage_and_reservations.sql`.
3. **Smoke**: one CREATE + one REPAIR (Sheets) on staging; verify `llm_usage_events` rows.
4. **Validate model IDs** against provider docs before prod promotion.

## Tests added

- `test_model_stage_router.py`, `test_pricing_economics.py`
- `test_gateway_reasoning_kwargs.py`, `test_repair_contract_paths.py`
- `tests/benchmarks/test_builder_routing_benchmark.py`

## Known limits

- Browser tools are stubbed until E2B Playwright mode is enabled in infra.
- Budget reservation RPC is best-effort insert; full advisory-lock RPC can be added in a follow-up migration.
- Six pre-existing Supabase-local integration tests may still fail without local DB config.

## Score estimate

| Dimension | Before | After |
|-----------|--------|-------|
| Routing | 5/10 | 9/10 |
| Repair fidelity | 4/10 | 8/10 |
| Verification gates | 5/10 | 8/10 |
| Cost accuracy | 4/10 | 8/10 |
| **Overall coding agent** | **6–7/10** | **~9/10** |
