# Security Checklist — Phase 3

## Before enabling real LLM execution

- [x] JWT verification configured (JWKS or JWT secret); unverified decode forbidden outside explicit local stub
- [x] Internal service token compared with `hmac.compare_digest`
- [x] Rate limits / quotas enforced server-side (PostgreSQL atomic)
- [x] Publish requires valid AgentSpec, GraphSpec, compile, smoke test
- [x] GraphCompiler rejects unknown nodes/tools and executable payloads
- [x] SSRF controls on `fetch_url` and knowledge URL ingest
- [x] Secrets redacted from logs and run events
- [x] Dockerfile non-root + healthcheck
- [x] No `.env` committed; gitleaks in CI
- [x] RLS tests for memories / deployments / queue
- [x] Tool allowlist only
- [x] Bounded repair (≤ 2) and run limits
- [x] Chat `attachments` bucket MIME allowlist + 8 MiB size (aligned with composer)
- [x] Auth captcha token plumbing (hCaptcha) on login / signup / reset when configured
- [ ] Provider keys present in local `.env` or Secret Manager (operator)
- [ ] Staging Cloud Run + Cloud Tasks OIDC (operator after GCP setup)

## CI gates (fail deployment on Critical)

- Frontend: lint, typecheck, unit, build
- Python: ruff, pytest, bandit, pip-audit
- Frontend deps: `pnpm audit` (critical/high) + Dependabot weekly
- Containers: Trivy
- Repo: gitleaks, semgrep
- Database: pgTAP RLS

## Operator pre-prod

- [ ] Rotate any keys previously shared in chat
- [ ] Confirm `ENVIRONMENT=production` on Cloud Run
- [ ] Confirm CORS allowlist matches production origins only (`CORS_ORIGINS` includes `https://stack32.com` / `https://www.stack32.com`, not `*`)
- [ ] Confirm `DATABASE_URL` is direct/server-only (not exposed to browser)
- [ ] Confirm Supabase Auth email confirmations + hosted captcha enabled
- [ ] Confirm Supabase **automatic backups** (and PITR if on a plan that supports it)
- [ ] Document restore drill (who restores, from which backup, RTO target)
- [ ] Keep CSP Report-Only until Whop / hCaptcha / PostHog reports are clean, then enforce