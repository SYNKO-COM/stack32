# Live stress learnings

Real end-to-end runs against local `agent-service` + hosted Supabase for user with
active Pipedream connections (`google_calendar`, `notion`, `canva`).

## Totals

| Batch | Agents | Build OK | Live completed |
|-------|--------|----------|----------------|
| Batch A (`scripts/live_stress_agents.py 8`) | 8 | 8 | 8 |
| Batch B (`… 4 8`) HubSpot/Linear/GitHub/Stripe | 4 | 4 | 4 |
| **Total** | **12** | **12** | **12** |

Script: `scripts/live_stress_agents.py` (create via RPC → clone BYOK LLM secret → bind apps → Builder → Live).

## What worked

- **Builder** builds completed (~55–76s) for all 12 agents.
- **Live** runs reached `completed` once installation LLM secret was cloned from Meet Prep.
- **Canva**: created a real landscape presentation (“Stress Test Deck”).
- **Notion / Slack / Sheets / HubSpot / Linear / GitHub / Stripe**: agents correctly asked for missing static config (page, channel, sheet, team, repo, customer) instead of inventing IDs.
- **Research bot**: web research answer returned.

## Weaknesses found (fed back)

1. **`LLM_CONFIGURATION_REQUIRED`** on brand-new agents — Live requires installation-scoped BYOK; platform keys are not used. Lesson recorded.
2. **Calendar bind** with empty `tool_ids` did not enable `calendar_list` → list events still failed until tool ids are explicit. Lesson recorded.
3. **Notion** cannot write without page/database — confirms `app_hints.json`.
4. **Readiness** often stays `needs_setup` even when Live can answer (gates vs practical Live) — worth tightening later, not blocking.
5. Shell `source .env` breaks `PIPEDREAM_ALLOWED_ORIGINS` JSON — use Python dotenv parsers, not shell source, for scripts.

## Lessons written to `builder_error_lessons`

- Calendar bind must pass `calendar_list` / `calendar_create_event`.
- Notion needs `pageId` / `databaseId` before writes.
- Canva create-design: keep `designType=preset` + dynamic props.
- New agents need per-installation `llm_api_key` before Live.

## How to re-run

```bash
cd /Users/3van/Documents/Stack32
PYTHONUNBUFFERED=1 python3 -u scripts/live_stress_agents.py 8      # first 8
PYTHONUNBUFFERED=1 python3 -u scripts/live_stress_agents.py 4 8    # next 4 (offset 8)
```

Agents are named `Stress …` and safe to soft-delete from the UI.
