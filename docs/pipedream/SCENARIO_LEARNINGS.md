# Agent scenario matrix learnings

Generated: `2026-08-15T20:58:13.963946+00:00`
Scenarios: **104** — passed soft checks: **104** / failed: **0**

## Purpose

Offline stress of Builder capability extraction + Pipedream app-hint coverage.
Does **not** create production agents or run Live OAuth — safe for CI/local.
Findings feed `app_hints.json` and orchestrator knowledge.

## Apps most requested

- `notion` × 42
- `slack` × 38
- `gmail` × 30
- `canva` × 20
- `slack_v2` × 19
- `google_calendar` × 14
- `google_sheets` × 14
- `github` × 12
- `linear` × 10
- `google_docs` × 8
- `discord` × 8
- `stripe` × 8
- `hubspot` × 8
- `google_drive` × 6
- `airtable` × 6
- `zendesk` × 4
- `intercom` × 4
- `jira` × 4
- `asana` × 4
- `trello` × 4
- `gitlab` × 4
- `mailchimp` × 4
- `twitter` × 4
- `linkedin` × 4
- `instagram` × 4

## Missing app_hints (priority)

- None — all referenced apps have hints.

## Hard rules reinforced

1. Auth prop ≠ app slug (`googleCalendar`, `googleSheets`, …).
2. `reloadProps` → always pass `dynamic_props_id`.
3. Notion needs page/database; Slack/Discord need channel; Canva needs designType+name.
4. Never strip required tools on Live repair.

## Failures (sample)

- None.
