# Integrations setup checklist

## 1. Environment

Copy [`.env.example`](../.env.example) and set:

### Required for production

- [ ] `ENVIRONMENT=production`
- [ ] `ALLOW_UNVERIFIED_JWT=false`
- [ ] `SECRETS_ENCRYPTION_KEY` (Fernet)
- [ ] `SUPABASE_*` + `INTERNAL_SERVICE_TOKEN`
- [ ] `DATABASE_URL` (Postgres) if `AGENT_RUNTIME_VERSION=langgraph`
- [ ] `SANDBOX_PROVIDER=e2b` + `E2B_API_KEY` (not `local`)

### Google OAuth (native Gmail/Calendar)

- [ ] `GOOGLE_OAUTH_CLIENT_ID`
- [ ] `GOOGLE_OAUTH_CLIENT_SECRET`
- [ ] `GOOGLE_OAUTH_REDIRECT_URI` → `{APP}/api/connections/google/callback`

### Pipedream Connect (optional until marketplace journeys)

- [ ] `PIPEDREAM_CLIENT_ID`
- [ ] `PIPEDREAM_CLIENT_SECRET`
- [ ] `PIPEDREAM_PROJECT_ID`
- [ ] `PIPEDREAM_ENVIRONMENT=development|production`
- [ ] `PIPEDREAM_ALLOWED_ORIGINS` (JSON list including app origin)

For a full production-like local profile see [LOCAL_PRODUCTION_TESTING.md](./LOCAL_PRODUCTION_TESTING.md)
and [`.env.production-like.example`](../.env.production-like.example).

After Connect OAuth for Pipedream apps, call sync + bind (UI does this after the popup):

```bash
# or via UI Structure sheet / Builder connection card
curl -X POST "$AGENT_SERVICE_URL/v1/integrations/accounts/sync" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"app_id":"slack","agent_id":"<agent>","tool_ids":["pd:slack-send-message-to-channel"]}'
```

Apply migration `agent_tool_configurations` (M8) before relying on tool static config.

- [ ] At least one LLM key (`OPENAI_API_KEY` / `XAI_API_KEY` / …)
- [ ] `WEB_SEARCH_API_KEY` if web_search must be live

## 2. Database

```bash
supabase start
supabase db reset --local   # or supabase db push --linked
pnpm supabase:types
supabase test db
```

Confirm migration `20260811000001_m7_hybrid_integrations.sql` applied
(`needs_setup`, catalog cache columns, broadened `user_connections.provider`).

## 3. Agent service

```bash
cd services/agent-service
python -m venv .venv && source .venv/bin/activate
pip install ../stack32-agent-runtime
pip install -e ".[dev]"
pytest
uvicorn agent_service.main:app --reload --port 8000
```

Health:

- `GET /health`
- `GET /v1/providers/health` (JWT)

## 4. Manual journeys

| Journey | Expectation |
|---|---|
| Writing-only agent | `ready` without OAuth |
| Email agent | `needs_setup` + Connect card; after Google OAuth → resume / ready |
| Calendar read | scopes readonly; list events works |
| Gmail draft vs send | draft ≠ send; send requires approval |
| HubSpot / long-tail | Pipedream Connect token + account bind (creds required) |
| Unsupported API | Custom API / `http_request` + secret + allowlist |
| Publish while `needs_setup` | Rejected with `READINESS_FAILED` |
| Live without connection | `runtime.connection.required` UI, run not falsely completed |

## 5. Opt-in smoke (network)

```bash
python scripts/pipedream_smoke.py   # requires PIPEDREAM_* ; not run in CI
```

## 6. CI

- Web: lint, typecheck, unit, build
- DB: lint, pgTAP (incl. `014_m4_m7_connections_isolation`), types diff
- Agent: ruff, pytest, bandit (with `stack32-agent-runtime` installed)
- Security: gitleaks, pip-audit, Trivy image (`services/` build context)
