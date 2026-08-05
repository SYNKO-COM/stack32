# Incident Response — Stack32 Phase 3

## Severity

| Level | Examples | Response time |
| --- | --- | --- |
| Sev-1 | Secret leak, cross-tenant data access, RCE | Immediate |
| Sev-2 | Auth bypass, SSRF to metadata, unbounded spend | < 4h |
| Sev-3 | Single-user data exposure, broken publish gate | < 24h |
| Sev-4 | Hardening debt, low-risk misconfig | Next sprint |

## Immediate actions (Sev-1 / Sev-2)

1. Rotate compromised keys (Supabase service-role, provider keys, internal token).
2. Disable AI execution: `AI_EXECUTION_MODE=disabled` and/or pause Cloud Run.
3. Revoke suspicious sessions in Supabase Auth.
4. Preserve logs (Cloud Logging / Sentry) — do not wipe.
5. Notify affected users if PII or secrets were exposed.

## Secret rotation checklist

- Supabase: Project Settings → API → regenerate service_role; update Secret Manager + local `.env`.
- OpenAI / xAI / others: revoke + create new key; update Secret Manager.
- `INTERNAL_SERVICE_TOKEN` / `AGENT_SERVICE_INTERNAL_TOKEN`: generate new random 32+ bytes; redeploy web + agent-service together.
- LiteLLM master key: rotate and restart gateway.

## Post-incident

- Document finding in `PHASE_3_SECURITY_AUDIT.md`.
- Add regression test when possible.
- Update `SECURITY_CHECKLIST.md` if a control was missing.
