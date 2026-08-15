# Live tool failure playbook (Stack32 Builder)

Also see platform knowledge: [docs/pipedream/CONNECT_KNOWLEDGE.md](../pipedream/CONNECT_KNOWLEDGE.md) and learned shapes in `tool_config_playbooks`.

When a user (or **Try to fix**) reports Live tool failures while apps show Connected:

## Hard rules

1. Prefer **surgical** fixes (prop mapping, tool_config, bindings).
2. **Do not** remove tools that still match the agent goal.
3. **Do not** add unrelated apps/tools.
4. Re-test by asking the user to send another Live message after the fix.

## Known failure: Google Calendar via Pipedream

**Symptom:** `runtime.tool.failed` on `calendar_create_event` with  
`Missing required parameters: text` or silent create-event failure.

**Cause:** Stack32 native Google tools fall back to Pipedream when no Stack32 Google OAuth token exists. Wrong Connect props were used:

| Wrong | Correct |
|-------|---------|
| Auth key `google_calendar` | Auth prop `googleCalendar` |
| `start` / `end` objects | `eventStartDate` / `eventEndDate` strings |
| quick-add without `text` | `text: "{title} at {start}"` |

**Fix location:** `agent_service/connections/google_tools.py` (`_try_pipedream_action`, `_props_for_pd_calendar_create`).

## Known failure: Canva create design

**Symptom:** `Pipedream action failed for canva-create-design` with  
`'name' must not be null`.

**Cause:** `canva-create-design` uses Pipedream `reloadProps`. After `designType=preset`, a dynamic `name` prop appears (`doc` / `presentation` / …). Connect requires:

1. `POST /connect/{project}/actions/props` with `designType` set → receive `dynamicProps.id`
2. `POST .../actions/run` with `dynamic_props_id` + `name` (+ optional `title`)

Also default `designType=preset`, `name=doc` when the model omits them.

**Fix location:** `pipedream/client.py` (`reload_props`, `run_action(dynamic_props_id=...)`) and `pipedream/provider.py`.

## Diagnosis checklist

1. Read `run_events` for the Live `run_id` (`runtime.tool.failed` payload).
2. Confirm connection is Pipedream-bound for that **app** (`external_account_id`).
3. Compare runtime args to Pipedream `configurable_props` for the action key.
4. Patch mapping / defaults; keep the tool on the agent.
5. Ask for a Live re-run; Memory should light from message 2+.

## User path: Try to fix

Structure error banner → **Try to fix** / **Essayer de corriger**:

1. Copies an English repair prompt (logs + constraints) to the clipboard.
2. Opens Build with the same prompt and auto-sends it to Stack32 Builder.
