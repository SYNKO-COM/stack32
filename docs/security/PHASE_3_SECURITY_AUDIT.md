# Phase 3 Security Audit

_Last updated: 2026-08-05_

## Scope

Frontend (Next.js), Agent API (FastAPI), Supabase Auth/RLS/Storage, model gateway, orchestration, tools, knowledge, memory, publishing, CI/CD, secrets, cost controls.

## Findings

### SEC-001 — Unverified JWT decode in development

| Field | Value |
| --- | --- |
| Severity | **High** |
| Affected | `services/agent-service/agent_service/auth.py` |
| Impact | Any crafted Bearer token accepted when JWKS/secret missing |
| Remediation | Require explicit `ALLOW_UNVERIFIED_JWT=true` flag; default deny; never in production |
| Status | **Fixed** |

### SEC-002 — Internal token comparison not constant-time

| Field | Value |
| --- | --- |
| Severity | **High** |
| Affected | `auth.py` `require_internal_service` |
| Impact | Timing side-channel on service token |
| Remediation | `hmac.compare_digest` |
| Status | **Fixed** |

### SEC-003 — Publish without validation gates

| Field | Value |
| --- | --- |
| Severity | **High** |
| Affected | `apps/web` publish path / agents repo |
| Impact | Invalid or untested agents can be marked published |
| Remediation | Server-side publish in Agent API with spec/graph/compile/smoke gates |
| Status | **Fixed** (Agent API publish path) |

### SEC-004 — No rate limiting / quota enforcement

| Field | Value |
| --- | --- |
| Severity | **High** |
| Affected | Agent API |
| Impact | Denial-of-wallet, abuse |
| Remediation | PostgreSQL atomic rate limit + monthly cost quota RPCs |
| Status | **Fixed** |

### SEC-005 — Dockerfile runs as root

| Field | Value |
| --- | --- |
| Severity | **High** |
| Affected | `services/agent-service/Dockerfile` |
| Impact | Container breakout impact amplified |
| Remediation | Non-root user, healthcheck, minimal image |
| Status | **Fixed** |

### SEC-006 — Overly permissive CORS methods/headers

| Field | Value |
| --- | --- |
| Severity | **Medium** |
| Affected | `main.py` |
| Impact | Broader browser attack surface |
| Remediation | Restrict to GET/POST/PATCH/DELETE and needed headers |
| Status | **Fixed** |

### SEC-007 — AI execution via Next.js service-role mock

| Field | Value |
| --- | --- |
| Severity | **Medium** |
| Affected | `apps/web/lib/ai/*`, server actions |
| Impact | Broad privilege in Next process |
| Remediation | `AI_EXECUTION_MODE=agent-service` routes to Agent API; mock remains explicit only |
| Status | **Fixed** |

### SEC-008 — Knowledge embedding without fixed dimension

| Field | Value |
| --- | --- |
| Severity | **Medium** |
| Affected | `knowledge_chunks.embedding` |
| Impact | Unsafe index / silent mismatch |
| Remediation | Migrate to `vector(1536)` for `text-embedding-3-small` |
| Status | **Fixed** |

### SEC-009 — Missing SSRF controls (pre-Phase 3)

| Field | Value |
| --- | --- |
| Severity | **Critical** (when tools enabled) |
| Affected | future `fetch_url` / URL ingest |
| Impact | Access to metadata / private network |
| Remediation | URL validator blocking private ranges, redirects revalidated |
| Status | **Fixed** (implemented with tools) |

### SEC-010 — Secrets historically shared in chat

| Field | Value |
| --- | --- |
| Severity | **High** (operational) |
| Affected | Operator credentials |
| Impact | Possible key compromise |
| Remediation | Documented rotation in checklist; do not store in client tables |
| Status | **Open (operator action)** |

## Residual risks (accepted for Phase 3)

- Malware scanning of uploads is TODO (documented); MIME/size/extension checks enforced.
- Cloud Tasks OIDC requires GCP project (scaffolded; local uses internal token + `run_queue`).
- Sequential vector search until HNSW index validated in staging.
