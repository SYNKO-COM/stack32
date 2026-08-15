# Pipedream knowledge (Stack32)

Curated Connect knowledge so Builder / runtime / Structure stay aligned with
upstream Pipedream without inventing auth props or skipping `dynamic_props_id`.

## Files

| File | Role |
|------|------|
| [CONNECT_KNOWLEDGE.md](./CONNECT_KNOWLEDGE.md) | Hard rules + API map + Stack32 lessons |
| [app_hints.json](./app_hints.json) | Per-app static-config hints (Notion page, Slack channel, …) |
| [ACTIONS.md](./ACTIONS.md) | Action configure / reload / run checklist |
| [SCENARIO_LEARNINGS.md](./SCENARIO_LEARNINGS.md) | Offline capability matrix takeaways |
| [LIVE_STRESS_LEARNINGS.md](./LIVE_STRESS_LEARNINGS.md) | Real Live stress takeaways (Calendar bind, Canva, Notion, BYOK) |
| [LLMS_INDEX.md](./LLMS_INDEX.md) | Pointers into upstream Pipedream llms.txt |

## Runtime wiring

- Python: `agent_service.integrations.pipedream.knowledge` (cached file reads)
- Learning: `agent_service.learning.playbooks` → `tool_config_playbooks` (fire-and-forget on Live tool success/fail — does not block the run)
- Scenarios (opt-in CLI): `python -m agent_service.learning.run_scenario_matrix`
- Live stress (opt-in CLI): `scripts/live_stress_agents.py`
- API: `GET .../tools/{tool_id}/config` returns `app_hint` + `playbooks` for Builder — **not** shown as tech banners in Structure UI
- Orchestrator injects a short Connect reminder + app hints (capped ~1.8k chars) on build; fuller rules on repair

Generated reports `*_report.json` under this folder are gitignored.

## Learning loop

1. User connects an app and configures Structure static props.
2. Live run succeeds → sanitized config **shape** recorded (no PII values).
3. Next build for the same action loads playbooks + app hints.
4. Failures bump `times_failed` and feed Builder repair lessons.

Upstream: [Connect components](https://pipedream.com/docs/connect/components), [llms.txt](https://pipedream.com/docs/llms.txt).
