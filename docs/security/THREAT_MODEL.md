# Stack32 Threat Model — Phase 3

## Assets

| Asset | Sensitivity |
| --- | --- |
| Supabase Auth sessions / JWTs | Critical |
| Service-role key / `DATABASE_URL` | Critical |
| Provider API keys (OpenAI, xAI, …) | Critical |
| User agent specs, messages, memories, knowledge | High |
| Run events / usage / cost data | Medium |
| Published deployment records | High |

## Trust boundaries

```text
Browser (untrusted)
  → Next.js (trusted for SSR / BFF, never stores provider keys in client)
  → Agent API (trusted runtime; verifies JWT; owns LLM + tools)
  → Supabase Postgres / Storage (RLS for clients; service-role server-only)
  → LiteLLM / providers (external; treat responses as untrusted content)
  → Cloud Tasks / run_queue (authenticated; payload = run_id only)
```

## Adversaries

1. Anonymous internet scanner
2. Authenticated user attacking another user’s data
3. Prompt injection via documents / tool results / URLs
4. Compromised browser session
5. Malicious AgentSpec / GraphSpec trying to escape the compiler
6. Denial-of-wallet via unbounded LLM / tool loops
7. Insider with repo access (secrets in git)

## STRIDE summary

| Threat | Mitigation |
| --- | --- |
| Spoofing | JWT JWKS/HS256 verification; internal token timing-safe; Cloud Tasks OIDC (prod) |
| Tampering | Immutable versions; optimistic patches; GraphCompiler allowlist |
| Repudiation | `security_audit_events` for publish, memory clear, approvals |
| Information disclosure | RLS; redaction; no secrets in events/logs/specs |
| Denial of service | Rate limits, quotas, run bounds, circuit breakers |
| Elevation of privilege | Tool allowlist; no arbitrary code; approval framework |

## Attack surfaces in scope for Phase 3

- Builder / Live message endpoints
- Identity form resume
- Knowledge upload + URL fetch (SSRF)
- Graph compilation
- Task worker endpoint
- Publish / unpublish
- Memory read/write/clear

## Explicitly out of scope (Phase 4)

- User-supplied code sandboxes
- User MCP servers
- External OAuth connectors
- Always-on listeners
