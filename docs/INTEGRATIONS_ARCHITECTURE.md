# Integrations architecture (hybrid)

Stack32 resolves tools through a capability-driven pipeline and executes them via
pluggable providers: **native**, **Pipedream Connect**, and **custom API**.

## Source of truth

| Layer | Store |
|---|---|
| Catalog | `tool_definitions` / `tool_versions` / `connector_definitions` |
| Legacy (read-only) | `tool_catalog` |
| Spec | AgentSpec **4.0** (`ToolBinding` + `ConnectionRequirement`) |
| User auth | `user_connections` (+ `external_account_id`, `provider_metadata`) |
| Agent bind | `agent_connection_bindings` |

## Flow

```
User prompt → capability extraction → JIT registry search → rank
  → ToolBinding (V4) → ConnectionRequirement
  → missing connection? → needs_setup / connection interrupt
  → sandbox build → evaluate_agent_readiness → ready | needs_setup | needs_attention
  → Live provider router → execute_tool
```

## Providers

- **Native** — local tools + Google Gmail/Calendar via `ConnectionManager`.
- **Pipedream** — marketplace apps via Connect tokens (`external_user_id` = Supabase user UUID).
- **Custom API** — allowlisted HTTP with SSRF checks and encrypted secrets.

`ProviderRegistry` resolves a `ToolRef` → provider → validate → execute.

## Readiness

`evaluate_agent_readiness` checks: spec, tool resolution, connections, config,
build success, and risk/approval policy. Publish and Live gates refuse
`needs_setup` / `needs_attention`.

## Runtime

- `AGENT_RUNTIME_VERSION=legacy|langgraph` (default legacy until soak).
- LangGraph checkpoints: `AsyncPostgresSaver` when `DATABASE_URL` is set.
- MemorySaver is **forbidden** when `ENVIRONMENT=production`.

## UI surfaces

No global `/integrations` page. Reusable cards in **Build** and **Agent IA**:
`IntegrationConnectionCard`, `ToolSetupCard`, `connection_form` / `approval_form`
UI components.
