# Tool config pipeline (Structure → runtime → Pipedream)

How Stack32 turns Structure UI dropdowns into autonomous Live tool calls without asking users for raw IDs again.

## Overview

```mermaid
flowchart LR
  UI[Structure ToolConfigForm] --> API[PUT /agents/{id}/tools/{tool_id}/config]
  API --> DB[(agent_tool_configurations)]
  Spec[AgentSpec ToolBinding.config] --> Runtime[Live / LangGraph runtime]
  DB --> Runtime
  Runtime --> Merge[resolve_effective_tool_config]
  Merge --> Schema[normalize_static_config_for_schema]
  Schema --> LLM[OpenAI tool schema — static props hidden]
  Schema --> Exec[build_configured_props → Pipedream run_action]
  Hints[docs/pipedream/app_hints.json] --> UI
  Hints --> Merge
```

## 1. Structure UI

- **Component:** `apps/web/components/builder/tool-config-form.tsx`
- Loads schema + saved config via `GET /v1/agents/{agentId}/tools/{toolId}/config`
- Renders Pipedream static props (remoteOptions dropdowns) with labels from `app_hints.json` and `prop-labels.ts`
- On save: `PUT .../config` with `{ config: { sheetId, worksheetId, ... }, connection_id }`
- Also binds OAuth via `bindIntegrationConnection`

User-facing labels (e.g. « Fichier Google Sheets ») map to backend prop names (`sheetId`, `spreadsheetId`, …) defined by the Pipedream component — never invented by the UI.

## 2. Persistence

| Store | Scope | Contents |
|-------|--------|----------|
| `agent_tool_configurations` | Per user + agent (+ optional `installation_id`) | Static props JSON (`config`), `connection_id`, status |
| `ToolBinding.config` on AgentSpec | Portable template (sanitized on publish) | Non-account-specific defaults; account IDs stripped at publish |
| `agent_connection_bindings` | OAuth / Pipedream account → tool_ids | Auth only, not spreadsheet/channel IDs |

Published specs **must not** contain account-specific IDs (`spreadsheetId`, `channel`, …) — see `publishing/sanitizer.py`.

## 3. Runtime resolution

**Module:** `agent_service/integrations/pipedream/tool_config.py`

1. `load_agent_tool_config` — reads DB row(s), prefers installation-scoped + non-empty config
2. `merge_binding_and_stored_config` — merges `ToolBinding.config` + DB row
3. `normalize_static_config_for_schema` — maps aliases from `app_hints` (e.g. `spreadsheetId` → `sheetId`)
4. `resolve_agent_tool_configs` — all enabled `pd:*` tools for a run

**LangGraph Live** (`runtime/langgraph_runtime.py`):

- Calls `resolve_agent_tool_configs(..., installation_id=...)`
- Passes configs to `async_schemas_for_tools` (hides configured static props from LLM)
- Injects `CONFIGURED TOOLS` block into the system prompt
- Passes `tool_config` / `tool_configs` in `execute_tool` context

**Execution** (`integrations/pipedream/schema.py` → `build_configured_props`):

- Merges auth (server) + normalized static config + LLM runtime args
- Calls Pipedream `run_action` with `configured_props`

## 4. App hints (`docs/pipedream/app_hints.json`)

Per-app entries support:

| Field | Purpose |
|-------|---------|
| `required_static_hints` | UI labels + alias key groups (`sheetId`, `spreadsheetId`) |
| `prop_aliases` | Explicit canonical → alias list for runtime normalization |
| `required_props` | Documentation / builder guidance |
| `auth_prop_guess` | Pipedream auth prop name (camelCase) |
| `builder_guidance` | Builder orchestrator only (not shown in Structure) |

**Reference implementation:** `google_sheets` — spreadsheet + worksheet pickers, alias mapping, dynamic props / `dynamic_props_id`.

## 5. Adding a new Pipedream app

1. Add / extend an `app_hints.json` entry with `required_static_hints` and optional `prop_aliases`
2. Add human labels in `apps/web/lib/integrations/prop-labels.ts` if needed
3. Ensure Pipedream props classify as `static` in `schema.py` (`remoteOptions` or `_STATIC_NAME_HINTS`)
4. No runtime code change required if aliases are declared in hints — normalization is generic

## 6. Tests

- `tests/test_tool_config_runtime.py` — alias merge, schema hiding, system prompt block
- `tests/test_pipedream_schema.py` — prop classification (Sheets `sheetId` forced required)

## 7. Common failures

| Symptom | Likely cause |
|---------|----------------|
| Live asks for spreadsheetId | Config not saved, wrong `tool_id` key, or alias not in hints |
| Tool runs but wrong sheet | Stale config row; check `agent_tool_configurations` for agent + tool_id |
| Config saved in Structure but empty at Live | Missing merge with `installation_id` or duplicate rows — see `_pick_tool_config_row` |
| LLM still sees sheetId in schema | Config key doesn't match schema prop or alias group |
